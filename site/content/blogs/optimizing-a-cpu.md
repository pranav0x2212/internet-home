---
title: "I Optimized a CPU Until the Tools Stopped Agreeing With Me"
date: "2026-11-03"
tags:
  - hardware
  - FPGA
  - computer-architecture
  - optimization
  - bluespec
  - RISC-V
description: "Taking a speculative RISC-V CPU from 11.9 MHz to nearly 100 MHz through timing analysis, RTL optimizations, and a few lessons learned the hard way."
permalink: posts/{{ title | slug }}/index.html
author_name: M Pranav
author_link: "https://github.com/pranav0x2212"
collections:
  - blogs
---

Simulation is a very forgiving place. A clock cycle in simulation lasts exactly as long as you are willing to wait for it. When you're designing hardware just to get the functional simulation working you can get away with writing some pretty absurd RTL (the code that describes the hardware, Bluespec in my case), because if the tests pass, the tests pass. So when my Out-of-Order RISC-V core, [Specula](https://github.com/pranav0x2212/Specula), booted [xv6](https://pdos.csail.mit.edu/6.828/2012/xv6.html) to a shell prompt I was pretty happy with myself. The problem starts when you synthesize it and ask the FPGA to actually build what you wrote. I pointed Vivado at it and asked how fast it could really run, and the first answer was about 12 MHz.

This post assumes you're already familiar with the basic idea of how an out-of-order, speculative processor works under the hood. I'm not going to explain every piece of a reorder buffer or reservation station from scratch. There is already enough hardware in this story without turning it into a CPU architecture textbook.

---

## The Slow CPU

To get that number I synthesized Specula for an Artix-7 (the chip on a Basys 3 board) with a 10 ns clock constraint, which is 100 MHz. The worst path in the design took 83.6 ns, so the worst negative slack (WNS, how far the slowest path misses the clock) was -73.8 ns and the best clock I could hope for (the Fmax) was around 12 MHz. On top of that it used 30,582 LUTs (the small lookup tables an FPGA builds all of its logic out of) on a chip that has roughly 20,800, so it was too slow and too big at the same time, which I'd say is a fairly impressive way to start.

This post is about the weeks between that report and roughly 99 MHz, and honestly it's mostly about the things I got wrong on the way. Specula is just the thing I happened to be fighting with.

> [!NOTE] 
> Everything here comes from Vivado synthesis only, with no place and route, and I compute Fmax as 1000 / (10 - WNS) ns. These are measurements I wrote down as I went, and some of my scratch scripts didn't survive a reboot, so please read them as a lab notebook and not as a clean benchmark.

![Estimated Fmax at each optimization checkpoint, rising from about 12 MHz to about 99 MHz, with two reverted experiments shown as dashed bars](/images/optimizing_a_cpu_journey.svg)

> The headline progression. The shape matters more than any single point: big wins early, then a long tail where each step gets smaller and harder to trust. The dashed bars are experiments I reverted, and the bars come from checkpoints in my notes, not from one continuous run.

---

## Just Enough CPU

Even with that assumption, a few things about Specula specifically matter for the rest of this. It fetches one instruction per cycle but executes them out of order, with the usual rename, reservation station and reorder buffer (ROB) machinery in the middle, and the ROB is what retires everything in program order so the program still looks sequential from the outside.

Memory is where it gets messy. Loads and stores go through their own memory queue, and stores wait in a store queue until they commit, which means every younger load has to look at all the older stores and ask a few questions: does any of them overlap my address, has it even computed its address yet, and if it overlaps, can I just take its data directly (store forwarding)?

The last bit is that I wrote all of this in Bluespec, where a rule describes what happens in one clock cycle. Everything a rule does has to settle before the next clock edge, so optimizing timing mostly means making those chains shorter.

---

## Reading a Timing Report

A timing report is basically a list of paths. Each one starts at a flip-flop, goes through a chain of LUTs and wires, and ends at another flip-flop, and slack is the clock period minus how long the path actually took. Negative slack means the signal doesn't get there in time.

![A timing path from a launching flip-flop through three LUTs and their wires to a capturing flip-flop, drawn against the clock period with one path meeting the next clock edge and one missing it](/images/optimizing_a_cpu_timing_path.svg)

> The top row is the path as the tool sees it, and the bars underneath are the same path laid out against the clock. If it lands before the next edge there is slack, and if it lands after, the slack is negative.

When I look at a path I evaluate based on three things: how many LUT levels there are (each one costs roughly half a nanosecond once you count the wire), whether the time is going into logic or into routing (routing usually means some signal fans out to a huge number of places), and what the path is actually doing, since the cell names tell you a lot. When I see a long chain of `CARRY4` cells (the dedicated carry logic an FPGA uses for adders and comparators), I know I'm probably looking at some arithmetic, and when I see the same comparison and mux structure repeated over and over, it is often an RTL loop that Vivado has unrolled into hardware.

The first path I read properly was the 83.6 ns one, and it was the divider. I had written `a / b` and `a % b` for RISC-V's unsigned divide and remainder instructions (DIVU and REMU), and Vivado built exactly that: a combinational array divider with 32 subtract-and-compare steps, each waiting on the borrow from the one before it, so 32 ripple adders in a row inside a single cycle. So the tool was fine, and the 83.6 ns was entirely my fault for writing it that way.

---

## The 84 ns Divide

The fix is as old as the hills: stop dividing in one cycle. I replaced the operators with one shared 32-cycle radix-2 restoring divider, a tiny state machine that does one subtract and shift per cycle. The worst path went from 83.6 to 56.3 ns, WNS from -73.8 to -46.7 ns (about 18 MHz), and it saved around 2,300 LUTs as a bonus.

One thing worth noticing, because it comes back later: making an instruction take 32 cycles is a lot less scary in an out-of-order core than it sounds, since the reservation station only cares about when the result shows up. Anything that depends on it waits and everything else carries on.

---

## A 70-Level Path

With the divider gone, the new worst path was the 56.3 ns one, and this one was 70 logic levels deep, from a memory queue payload register to the load result queue. Read by what it passed through, it was the entire load pipeline crammed into one cycle, in three chunks.

The first was picking the oldest ready memory operation, which I had written as a loop over the 8 queue entries (`if (age < bestAge) { bestAge = age; pick = i; }`). In software that's seven cheap comparisons, one after another in time, but an RTL `for` loop doesn't run over time at all, it gets unrolled, which means the tool builds a separate copy of the comparison hardware for every iteration. Since each comparison needs the best age found by the one before it, those copies end up chained into one long combinational path, so what I had really built was seven comparators in series, about 28 levels and 27 ns.

The second was a virtual-memory page walk (Sv32 is RISC-V's 32-bit virtual memory scheme, and the translation walks through two levels of page tables), which was two dependent adds and two RAM reads for around 8 ns. The third was store forwarding, merging bytes from the store queue and then sign extending, which took about 20 ns.

![The 56.3 ns critical path split into oldest-ready selection (about 27 ns), the Sv32 page walk (about 8 ns) and store forwarding with extraction (about 20 ns), each feeding the next](/images/optimizing_a_cpu_critical_path.svg)

> The three chunks of the 56 ns path, drawn to scale. The oldest-entry scan, a loop I wrote without thinking much about it, was nearly half of it, and each chunk needs the answer from the one before.

The fix was a balanced comparison tree, with ages expressed relative to the ROB head so the comparisons can be combined in any order, which takes 8 entries down to 3 levels instead of 7 in series. That alone moved WNS from -46.7 to -34.9 ns (about 22 MHz). The tree isn't doing less work, by the way, it still needs seven comparators for eight entries, it just arranges them so that only three of them have to wait for each other instead of all seven.

![Eight queue entries compared in a serial chain of seven dependent comparisons, and then as a balanced tree of three levels](/images/optimizing_a_cpu_select_tree.svg)

> The same seven comparators in two shapes. The bars underneath are drawn to the same scale and show how many comparisons have to happen one after another.

I did the same to the store forwarding merge and got to -27.7 ns (about 26 MHz), although that one actually added about 1,000 LUTs, which was the first time I noticed that faster and smaller don't always go together.

---

## Paying for Capacity

Around here I wasn't only fighting time anymore, because the Basys 3 has about 20,800 LUTs and I was at 27,324. I attributed LUTs by leaf signal name, since bsc (the Bluespec compiler) inlines everything into one huge module and Vivado's hierarchical report blames the wrong blocks, and the answer was pretty clear: the ROB was the biggest consumer, at a flat ~139 LUTs and 116 flip-flops per entry, scaling linearly across all 64.

Cutting the ROB from 64 to 32 entries removed about 5,700 LUTs (27,324 to 21,623). That is a real tradeoff, since the machine can now keep fewer instructions in flight in exchange for a lot of area, but it was one I was happy to make at that point. To be sure I wasn't breaking anything I brute forced every (head, count up to 32, a, b) combination and checked that the age arithmetic still worked with the smaller window.

The second change was more about representation than size. To answer "is this store older than this load?" the store queue was comparing 6-bit ROB tags, even though it only has 8 slots. So I compared queue positions instead, which are 3 bits, and that removed another 1,241 LUTs, took WNS to -20.9 ns (about 32 MHz), and gave me the first build that fit on the Basys 3, at 98% utilization so only just. Every bit you carry on every entry gets paid for in LUTs somewhere, so area turned out to be a budget I made architectural decisions against and not a number I looked at afterwards.

---

## Splitting the Pipe

After a first split of the memory path (a select stage and an issue stage) I was at about 59 MHz with -7.0 ns WNS, and the worst paths were still in the memory pipeline. The issue stage was doing the register file read, the base plus offset add, Sv32 translation, the store queue update, and then the forwarding and result enqueue on top of that, so I split it again. A new rule, `doMemAgu` (AGU as in address generation unit), does the register read, address add, translation and store queue update and writes into a pipeline register, and `doMemIssue` keeps the forwarding, the load, the extraction and the enqueue. The worst cone through the result queue (the cone being all the logic feeding one endpoint) went from -5.77 to -1.64 ns, global WNS went from -7.0 to -5.9 ns (59 to 63 MHz), and the LUT count actually dropped (20,037 to 19,443).

![The memory issue stage before the split, as one stage, and after it, as doMemAgu and doMemIssue with a pipeline register between them, with the measured gains and the cost](/images/optimizing_a_cpu_pipeline_split.svg)

> The same work cut in two, with a pipeline register in the middle.

It wasn't free, though. Every memory operation now takes one more cycle, and on my 16 directed tests the cycle count went up by anywhere from 0.3% to 11% while Fmax went up by about 7%. On the worst of those tests I'd have lost overall, which is worth saying out loud because Fmax isn't performance. I kept the split because it removed the wall in front of me (the path that was limiting the clock), but it was more of a bet on what it would unlock than a clear win.

---

## The Wrong Hypothesis

With the memory path calmer, the new worst path ran from the register that holds the page table root (and switches paging on) to the program counter (PC), at -5.88 ns. This is the fetch loop: translate the PC, read the instruction, pull the jump offset out of a JAL instruction, add that to the PC through an 8-stage carry chain, and feed the predicted next PC back into the PC register. The path started at the paging register, so my guess was that the paging enable bit was the slow part and registering it would help.

It didn't. Registering the flag moved WNS from -5.879 to -5.787 ns, which is noise, and cost 372 LUTs, so I reverted it. When I read the path more carefully, it started there because of a safety check that the page table root really points into RAM, which was gating the page table entry, and not because of the paging bit at all. Chasing that turned up a few other things, like instruction fetch going through the full address decoder for the UART, interrupt controller and VirtIO disk even though code only ever comes from RAM (a RAM-only read port cut one path to the PC from 12.6 to 6.4 ns).

What really worked came from asking what the data path was carrying. The page table entries feeding fetch were being masked with that same safety check, even though the fault path already tracked exactly that. So I stopped gating the data and gated only the fault signal, with identical behavior cycle for cycle, and the path through the check dropped from 11.97 to 6.85 ns, which put WNS at -1.19 ns (~89 MHz). The register I had blamed was never the problem, the data path was just paying for a check that the fault path already did.

![Fetch loop before and after, with the root check masking the page table entry before, and only gating the fault signal after](/images/optimizing_a_cpu_fetch_loop.svg)

> The fix wasn't making the paging register faster. It was noticing the data path didn't need the check.

---

## The Experiments That Lost

For every change I kept there was probably one I reverted, and a few of them were more interesting than the wins.

<table style="border-collapse: collapse; width: 100%; font-size: 0.95em; line-height: 1.6; margin: 20px 0;">
  <thead>
    <tr style="border-bottom: 1px solid #444;"><th align="left" style="padding: 8px;">Experiment</th><th align="left" style="padding: 8px;">What I expected</th><th align="left" style="padding: 8px;">What I measured</th><th align="left" style="padding: 8px;">Verdict</th></tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Register only the paging flag</td><td style="padding: 8px;">Shorter path to the PC</td><td style="padding: 8px;">WNS -5.879 -> -5.787 ns, LUT +372</td><td style="padding: 8px;">Reverted</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Capture operands in the memory queue</td><td style="padding: 8px;">Shorter select path</td><td style="padding: 8px;">LUT +934, 21,623 -> 22,557</td><td style="padding: 8px;">Reverted</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Move the root check into the fault term</td><td style="padding: 8px;">Same hardware behavior</td><td style="padding: 8px;">WNS -2.798 vs ~-1.8 ns</td><td style="padding: 8px;">Reverted</td></tr>
    <tr><td style="padding: 8px;">Slimmer ROB entries, 133 -> 96 bits</td><td style="padding: 8px;">Save area</td><td style="padding: 8px;">FF -1,162, LUT +1,036</td><td style="padding: 8px;">Reverted</td></tr>
  </tbody>
</table>

The last one deserves a bit more explanation. I dropped a redundant tag field and merged two address fields in each ROB entry, the flip-flop count fell by 9.5% exactly like I predicted, and the load result queue's cone even shrank by 1,312 LUTs. But the total went up to 21,073 LUTs, 101.3% of the chip, and the worst path moved to the simulation watchdog comparator (`cycleCount > maxCycles`), so for a moment I was optimizing a CPU whose critical path was the logic that stops the simulation. The change worked locally, and Vivado made different choices everywhere else.

---

## The Instrument Is Noisy

That watchdog result should have warned me, but what finally convinced me was running a few deliberately boring experiments to see how much of what I measured was my changes and how much was Vivado. First I renamed some signals and nothing else, and got a byte-identical netlist (18,888 LUTs), so at least the tool is deterministic. Then I relaxed the clock to 14 and 20 ns, hoping an easier target would calm things down, and got the exact same netlist as at 10 ns. Then I wrote two functionally null rewrites in the ALU (the set-less-than instructions, SLTU done as a 33-bit subtract and SLT done with a sign flip), both exactly equivalent to what they replaced, and total LUTs moved by +872 and +1,005, individual cone delays moved anywhere from -1.75 to +1.8 ns, and the fetch cones, which those changes don't touch, got 0.7 to 1.8 ns worse.

Looking back at my own history after that was a little uncomfortable. The checkpoint I'd been proudest of (18,910 LUTs, -1.8 ns) was a lucky outlier, because the next change, a functionally exact one that shrank its target cone from 11.02 to 2.90 ns, ended up with a global critical path of 13.7 ns, the worst of the set. In another case a predecode change took the fetch cones from -1.19 to +1.30 ns and made global WNS worse (-1.83 ns), because the memory queue selector cone, whose Verilog fan-in was identical, got remapped from 9 levels to 11. Over a handful of checkpoints that one cone read -1.50, -1.46, +0.50 and -1.83 ns without anyone touching it.

So Vivado's mapping is deterministic but chaotic, and with the chip nearly full it's worse. I stopped treating the tool like an oracle and started treating it like a noisy instrument I had to calibrate. In practice that meant judging changes by what happened to specific cones and not by the global WNS, often by pretending a path's starting point was free to see what the next wall would be. It meant synthesizing suspicious logic on its own, like a 64-way first-free encoder (64 LUTs, 6 levels and 5.07 ns as bsc generated it, against 54 LUTs, 3 levels and 4.15 ns for a balanced tree I wrote), with Yosys proving the two equivalent (the swap took the failing endpoints on the physical register ready bits, `prf_readyBits`, from 63 down to 5). And it meant separating cones that were mostly logic from cones that were mostly routing, since routing-dominated paths (70 to 78% wire here) change after place and route anyway.

![Renaming signals and relaxing the clock changed nothing, two equivalent ALU rewrites added 872 and 1,005 LUTs, and one untouched cone read -1.50, -1.46, +0.50 and -1.83 ns across four checkpoints](/images/optimizing_a_cpu_noise.svg)

> If synthesis were a clean oracle, changes that do nothing would cost nothing, and a cone nobody touched would stay put. Neither happens. I don't have a clean LUT versus WNS pair for every experiment, so rather than plot a scatter with gaps in it I'm only showing the numbers I actually measured.

---

## The Last Stretch

The last stretch came down to two changes, and the first is basically a single character. The store queue keeps one bit per slot recording whether that store has computed its address yet (a bitmask I called `sqExecd`, for "executed"). Before a load can issue it has to make sure no older store is still unexecuted, because that store might overlap the load and the load would read stale data, so the load/store unit checks those bits for every older valid store. I had written that check to read `sqExecd[1]`, a CReg port (Bluespec's way of letting one rule see another rule's write in the same cycle), so a store that executed this very cycle already counted.

That bypass turned out to be expensive. The address stage decides whether a store gets marked as executed using the translation result (permissions and faults included), and with the bypass that decision ran combinationally into the eight pending-store checks, then the issuable logic, the oldest-first selection, and finally the select enable for the memory queue, which fans out to around 128 places. A page table lookup in one stage was sitting upstream of load selection in the next. My own notes from just before this even listed a carry-select version of the bypass as a candidate fix, which would have added logic to make the bypass faster, and what I should have asked was whether I needed the bypass at all.

I didn't. A bit in `sqExecd` only ever goes from not-executed to executed during the life of a live store, so reading the previous cycle's value (`sqExecd[0]`) can only be stale in one direction: it might say "not executed" about a store that finished a cycle ago, which makes a load wait one extra cycle, but it can never say "executed" about a store that hasn't. It can delay a load and it can't let one go early. I changed `[1]` to `[0]`, all 21 directed tests passed, and the canonical xv6 run came out byte-identical.

![The sqExecd bypass chain in one cycle before the change, the same chain starting at a register after it, and a three-cycle strip showing port 0 can be one cycle late but never early](/images/optimizing_a_cpu_sqexecd.svg)

> Top: the address stage sat upstream of load selection. Middle: reading port 0 puts a clock edge in the way. Bottom: the only difference between the two ports is one cycle of staleness, always in the safe direction.

<table style="border-collapse: collapse; width: 100%; font-size: 0.95em; line-height: 1.6; margin: 20px 0;">
  <thead>
    <tr style="border-bottom: 1px solid #444;"><th align="left" style="padding: 8px;">Metric</th><th align="left" style="padding: 8px;">Before</th><th align="left" style="padding: 8px;">After</th></tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">LUTs</td><td style="padding: 8px;">20,057</td><td style="padding: 8px;">19,553</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">WNS</td><td style="padding: 8px;">-4.691 ns</td><td style="padding: 8px;">-0.572 ns</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">TNS (total negative slack)</td><td style="padding: 8px;">-839.520 ns</td><td style="padding: 8px;">-5.416 ns</td></tr>
    <tr><td style="padding: 8px;">Failing endpoints</td><td style="padding: 8px;">335</td><td style="padding: 8px;">26</td></tr>
  </tbody>
</table>

This is probably my favorite change in the whole project, partly because it's so small and removes so much, and partly because I got there by asking whether I needed the thing before asking how to make it faster.

The second was the multiplier. In an earlier timing census it was the one cone that wasn't mostly routing: the path from the ALU through two cascaded DSP48E1 blocks (the hard multiplier blocks built into the FPGA), a carry-chain adder and a few LUTs into the response queue was 76% logic and came out at around 9.86 ns every time, so roughly 100 MHz was the ceiling for a single-cycle multiply on this fabric no matter what I did around it. My first instinct was to make it smaller, but it's already built from hard DSP blocks, so there isn't much logic to remove. The problem was how much sat in one cycle, so instead of making the multiplier faster I gave it another cycle. The product is now captured in a register (`mulResult`) with a `mulPending` flag, and a small `mulDrain` rule pushes it into the response queue on the next cycle. Because that register sits right at the multiplier's output, Vivado can use the DSP48E1's own internal output register (called PREG), so the extra stage doesn't need a separate bank of LUTs and flip-flops built around the multiplier.

![The multiplier path before, with the product reaching the response queue in the same cycle, and after, with the product registered in cycle t and drained into the response queue in cycle t+1](/images/optimizing_a_cpu_multiplier.svg)

> The multiplier gets two cycles instead of one. The result reaches the response queue one cycle later, and the only other thing that notices is the ALU being busy for that cycle.

<table style="border-collapse: collapse; width: 100%; font-size: 0.95em; line-height: 1.6; margin: 20px 0;">
  <thead>
    <tr style="border-bottom: 1px solid #444;"><th align="left" style="padding: 8px;">Metric</th><th align="left" style="padding: 8px;">Before PREG</th><th align="left" style="padding: 8px;">After PREG</th></tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">LUTs</td><td style="padding: 8px;">19,553</td><td style="padding: 8px;">19,675</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">FFs</td><td style="padding: 8px;">12,351</td><td style="padding: 8px;">12,466</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">WNS</td><td style="padding: 8px;">-0.572 ns</td><td style="padding: 8px;">-0.115 ns</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">TNS</td><td style="padding: 8px;">-5.416 ns</td><td style="padding: 8px;">-0.115 ns</td></tr>
    <tr><td style="padding: 8px;">Failing endpoints</td><td style="padding: 8px;">26</td><td style="padding: 8px;">1</td></tr>
  </tbody>
</table>

The multiplier and DSP cascade paths disappeared from the critical path report. The multiplier itself isn't any faster, it just has two cycles now, and the change still cost about 120 LUTs and 115 flip-flops, so I wouldn't say the stage is free. An out-of-order core can take that for the same reason it took the iterative divider: the scheduler already copes with results arriving at different times, so one more cycle on a multiply doesn't bother anything that doesn't depend on it. There is a real cost, which is that `execute` is gated on `!mulPending`, so every multiply blocks the single ALU for one extra cycle, and I haven't measured what that costs on real programs.

---

## When to Stop

So that's roughly 12 MHz to roughly 99 MHz over several weeks, and the synthesis result gives me some headroom above the 90 MHz I settled on as the practical target for the project. I should be careful about what that means, because it isn't a guaranteed margin of any kind. Everything here stops at synthesis, and the current configuration uses the full simulation-sized memory, which doesn't give me a meaningful place and route result, so I don't know what the routed design would actually do.

As for why I stopped, mostly it's that I could no longer tell whether I was making things better. The remaining ideas were worth maybe a few tenths of a nanosecond, against a tool where I had measured more than a nanosecond of swing and about a thousand LUTs from changes that did nothing, and a lot of the remaining paths were going to move after routing anyway. Part of me still wants to keep going (there's always another cone), but "I can't tell my changes apart from the noise" seemed like a good sign that my time was better spent elsewhere.

---

## Further Reading and Deeper Rabbit Holes

If you want to spend the next few hours in the weeds of microarchitecture, timing and out-of-order execution, these are the places I would start.

- [Tomasulo's algorithm](https://en.wikipedia.org/wiki/Tomasulo%27s_algorithm) is the original idea behind reservation stations and dynamic scheduling, and it's where the "results can arrive whenever they like" behaviour comes from.
- The [Vivado Design Methodology guide (UG949)](https://docs.amd.com/r/2025.2-English/ug949-vivado-design-methodology) from AMD is a good read on how to think about logic levels, fan-out and register placement before you ever open a text editor, if you want to design for a high Fmax from the start.
- [*Modern Processor Design*](https://www.waveland.com/browse.php?t=624) by John Paul Shen and Mikko Lipasti is the textbook I would reach for on pipelines, store forwarding and speculation inside real out-of-order cores.
- [Dan Luu's blog](https://danluu.com/) has plenty of honest write-ups on hardware, performance and building complicated systems without losing your sanity.

And if you spend weeks balancing pipelines, rebuilding comparison trees and fiddling with register ports, and the hardware still refuses to hit your clock target, there is always the ultimate optimization strategy.

[![xkcd 378: Real Programmers](https://imgs.xkcd.com/comics/real_programmers.png)](https://xkcd.com/378/)

> Real programmers use butterflies.
