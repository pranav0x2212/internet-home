---
title: "Out of Order RISC-V core from scratch - Specula"
date: "2026-11-04"
tags:
  - systems
  - performance
  - architecture
  - cpu
  - low-level
description: "Building Specula, a 32-bit Out of Order RISC-V processor, from its microarchitecture and RTL implementation to FPGA synthesis and optimization."
collections:
  - blogs
previewimage: "/og/blogs-optimizing-a-cpu.png"
---

## Why I Decided To Go For Specula

It all began in my 4th semester (early 2025) of engineering where I truly felt bored about the courses offered to me. None of them interested me, so I did what any curious kid would have done: find something 
that actually excites them. I have been knee deep into the world of processor design and FPGAs. I had a good understanding of how basic in-order processors work and was wrapping my head around how 
hazards are dealt. Among one of these rabbit hole sessions, I remember searching up real world examples of in-order processors to see how different the CPU in my laptop is different from what I have 
been building for the past few months. 

I found that my Ryzen 9 CPU is something called an "Out of Order" processor. Bingo, more reason to not focus on my actual college course material. It looked just like the thing I wanted to take on next,
mainly because of two things: it's complexity and the fact that my laptop had something so much more sophisticated than what I thought. I am pretty sure I started the repository description for [Specula](https://github.com/pranav0x2212/Specula) 
something like "Specula is a dual-issue Out of Order RV32I processor in Bluespec SystemVerilog"... yeah, younger me seriously was too ambitious. 

The description remained the same for a while as I battled understanding the complex and intricate theory of how modern day processors work. The way I learn is to read about something, and try and replicate it
to see what falls apart along the way as that moment teaches far more than any theoretical class a person could attend. While that was the case for most of my projects, Specula truly was an outlier in that sense, 
simply because it wasn't like anything I had tried to read and understand by myself from before and was the second project in Bluespec I had decided to try in... all while I'm still learning Bluespec.

---

## What Exactly Is Specula?

For my beautiful readers who haven't heard the term "Out of Order processors" until you stumbled upon this blog, allow me to provide a crash course. Unlike a traditional in-order processor, an Out of Order processor 
can execute instructions as and when it's complete, provided there are no dependencies (more on this in the upcoming paragraphs). It uses a bunch of complex hardware units and algorithms to achieve this. Specula 
became a 32-bit, single issue (meaning, the processor can issue at most one instruction per clock cycle), Out of Order and Speculative (the processor executes instructions before it knows or sure whether those instructions are actually needed)
RISC-V processor, written entirely in Bluespec SystemVerilog. The design evolved quite a bit from the initial, ridiculous ambition where the implemented core is now 1-wide, uses register renaming to eliminate false 
dependencies and a reorder buffer to ensure that completed instructions eventually update architectural state in correct program order. 

Now that's a lot of buzzwords, so let's try to take it apart like cotton candy. 

![Specula microarchitecture](/images/specula-architecture.svg)

> High level microarchitecture of Specula. Some internal queues and control paths are omitted for clarity. 

For a great amount of time, the goal was to get an Out of Order processor running in Bluespec. Infact, for about 4 months (between Sep'25 to Feb'26) Specula was just collecting dust. In this timeskip, I had developed a much better understanding 
on how basic modern processors work and had also explored other Out of Order RISC-V designs to get an idea of how much further I could actually take Specula to. The most famous one was probably
Berkeley's [SonicBOOM](https://github.com/riscv-boom/riscv-boom), while to my surprise I actually found a project that made an Out of Order machine in Bluespec. These lads began [this project](https://github.com/csail-csg/riscy-OOO)
in 2017, when I was still just 4 feet 5 inches tall. 

In about March'26 I got back to Specula, still trying to attain just normal Out of Order execution. Somewhere along the way, I came across [xv6](https://pdos.csail.mit.edu/6.828/2012/xv6.html) and seeing all the other 
projects boot Linux made me ask, "Why not try and run an educational OS on my Specula?". This meant, I must now extend my processor with [privileged modes](https://www.geeksforgeeks.org/computer-networks/difference-between-user-mode-and-privileged-mode-in-cisco-router/)
, [CSRs](https://docs.riscv.org/reference/isa/v20260120/priv/priv-csrs.html), [trap handling](https://www.geeksforgeeks.org/operating-systems/traps-and-system-calls-in-operating-system-os/) and [Sv32 virtual memory](https://docs.riscv.org/reference/isa/v1.10/_attachments/riscv-privileged.pdf),
along with building necessary system components like [UART](https://en.wikipedia.org/wiki/Universal_asynchronous_receiver-transmitter), [PLIC](https://shakti.org.in/docs/plic_user_manual.pdf), and a VirtIO block device. 

I also wanted to see how the design translated into actual hardware, so I took it through a Vivado synthesis flow targeting an Artix-7 FPGA. So yes, once again I managed to involve 50 other domains into my project and made it complex.
But hey, isn't that how you learn :D

---

## The Magic Behind Modern Processors

Modern processors execute billions of instructions, but not every one of them takes the same amount of time to complete. An integer addition might finish relatively quickly compared to a division or memory access. Now imagine, a processor 
executing a sequence of instructions where one is waiting for data from memory, but several instructions behind it are completely independent. A traditional in-order processor can end up stalling even when there's useful work waiting to be done. 
This is one of the problems Out of Order execution tries to address. Instead of forcing instructions to execute strictly in the order they appear in the program, the processor allows independent instructions to make progress whenever their operands and execution resources are ready.

Of course, this isn't as simple as just shuffling instructions around. Some instructions genuinely depend on results of earlier ones, and others may access the same registers or memory locations. So we really need some mechanisms to keep track 
of these dependencies, find instructions that are actually ready to execute, and ensure that executing them in a different order doesn't change the program's observable behaviour. (And in the process, maybe not lose a hair or two.) 
This is where ideas like register renaming, reservation stations, and reorder buffer come into play. These are the mechanisms that make an Out of Order processor possible, and they're also the building blocks we'll encounter while exploring Specula.

![In-order vs out-of-order execution](/images/in-order-vs-ooo.svg)

> Comparing instruction execution in an in-order processor and an Out of Order processor. While the in-order processor stalls behind a long-latency instruction, the Out of Order processor can make progress on independent instructions.

---

## The Frontend: Fetching and Predicting What's Next

With all that theory running inside your brain, let's try to see how the internals of Specula look like. Every instruction's journey through Specula begins at the frontend. Its job is to fetch instructions from memory, determine where execution should continue,
and prepare instructions for the backend. Since Specula supports virtual memory and the RISC-V compressed instruction extension, fetching isn't a simple job of reading the next 32 bits from an address. Instruction fetch goes through Sv32 address translation, and compressed 
instructions are expanded before they proceed further into the pipeline. This gives the rest of the processor a consistent instruction representation to work with.

Another cool part of the frontend is something called as [branch prediction](https://en.wikipedia.org/wiki/Branch_predictor). Waiting for a branch instruction to execute before deciding what to fetch next would leave the frontend idle, so Specula uses a **gshare branch predictor** 
along with a Branch Target Buffer (BTB) to predict the next control flow path. The predictor uses a 64-entry, 2-bit Pattern History Table and a 6-bit Global History Register, while the BTB contains 16 direct-mapped entries. Specula also restricts itself to one unresolved control-flow instruction at a time, 
keeping branch recovery manageable. The prediction is eventually checked when the branch executes, and the predictor is updated at writeback. 

![Specula branch prediction](/images/specula-branch-prediction.svg)

> Branch prediction in Specula. The frontend uses a gshare predictor and BTB to determine the next fetch address, while branch outcomes are resolved during execution, predictor state is updated at writeback, and mispredictions are handled at the ROB head.

---

## Register Renaming and Dispatch

So in the second section of this blog post, I had talked about something known as "dependencies". Simply put, a dependency is a relationship where one instruction must wait for another to complete or provide a result before it can run safely. And since modern processors try to run instructions Out of Order,
dependencies _can_ limit the instruction speedup we are so dearly trying to achieve. Consider two instructions writing to the same architectural register: even if they are otherwise independent, the processor must ensure that one instruction doesn't accidentally overwrite a value another instruction still needs. 
This is where register renaming comes in. Specula has a Register Alias Table (RAT) that maps architectural registers to physical registers. When an instruction is dispatched, its source operands are mapped to their current physical registers, while its destination gets a newly allocated physical register from the free list. 
This removes false dependencies caused by Write After Read (WAR) and Write After Write (WAW) hazards, while preserving genuine Read After Write (RAW) dependencies.

![Register renaming](/images/specula-register-renaming.svg)

> Register renaming in Specula. Each instruction receives a physical destination register, eliminating false dependencies while preserving genuine data dependencies between instructions.

Once renamed, instructions are dispatched into appropriate backend structure. Specula has an 8 entry Reservation Station for arithmetic and branch instructions, and a seperate 8 entry memory queue for loads, store and atomic operations. Instructions also receive an entry in the 32 entry Reorder Buffer(ROB), which 
tracks their progress and ensures they eventually retire in program order. The physical register file holds 64 registers, and the free list tracks which ones are available for allocation.

![Specula backend](/images/specula-backend.svg)

> Backend organisation in Specula. Renamed instructions are dispatched to the Reservation Station or Memory Queue, while the Reorder Buffer tracks their progress and ensures they retire in program order.

---

## Execution, Memory and Retirement

The previous section gave a glimpse of the backend machinery of Specula. Who could have thought modern day processors are this complex? And to fit it in a small square in your laptop is another crazy feat. But I'd like to once again get into some deep details to make sure 
my readers truly understand the architectural magic that goes behind building modern day microchips. So do bear with me as the further sections are (spoiler alert) much more cooler and if you are already aware of the working of Reservation Stations, ROBs etc. feel free to skip ahead to the next chapter. 

Once instructions are dispatched, the spotlight sheds on the backend. Arithmetic and branch instructions wait in Specula's 8 entry Reservation Station until their source operands are ready. The scheduler selects the lowest index ready entry and sends it for execution; it doesn't necessarily select the oldest 
instruction. Operands are read from the Physical Register File when an instruction is selected. Specula's execution units include an ALU for integer and branch operations, a multiplier implemented using the FPGA's DSP resources, and an iterative divider that takes 32 iterations to complete.
Results are written back to the physical register file, and dependent instructions can then become ready for execution.

Memory instructions follow a seperate path through the Memory Queue. Specula uses an address generation stage followed by memory issue, with Sv32 translation performed along the way. Loads must wait until all older stores have known addresses, avoiding the need for speculative memory dependence 
prediction. The Store Queue handles pending stores and supports byte-level forwarding, allowing a load to obtain the required bytes from an older store when appropriate. Stores themselves don't update memory immediately after execution; they are held until the corresponding instruction commits. 
This keeps memory modifications consistent with the processor's retirement order.

And the final trick is the Reorder Buffer (ROB). It's very much like the glue that holds the entire execution process together. Instructions may finish in a completely different order from the one in which they were dispatched, but the ROB ensures that they retire in program order. Once an instruction reaches the head of the ROB and has completed successfully, 
it can commit its architectural effects. If you recall from the frontend section, Specula supports branch prediction. So if at all a misprediction occurs, the recovery takes place here with the help of the ROB. A mispredicted branch is acted upon when it reaches the ROB head, allowing Specula to flush the younger 
instructions, restore its rename checkpoint and redirect fetching to the correct address. 

![Specula instruction lifecycle](/images/specula-instruction-lifecycle.svg)

> The complete instruction lifecycle in Specula.

---

## Getting Specula to Run xv6

If you made it this far, congratulations, you essentially learnt half a semester worth of knowledge in about an hour or so. Now to fully visualize Specula, I need you to take up an elective course in Operating Systems fundamentals... which is needed because that was the next milestone for Specula. 

Getting Out of Order execution working was great. But we computer architects never stop at "great", we love to keep digging the hole until we reach the Earth's mantle. Now, the standard xv6 operating system is for 64-bit processors and sadly I had designed everything in 32-bit fashion. So I decided to go 
with [xv6-rv32](https://github.com/michaelengel/xv6-rv32) which is a port of MIT's xv6 OS to 32 bit RISC V. However, running an OS requires quite a bit more than implementing the base integer instruction set. As said earlier in the second section, Specula needs to support privileged execution, allowing software to operate 
at different privilege levels, and provide the mechanisms required to handle exceptions, interrupts and system calls. For Specula, this meant adding machine-mode and supervisor-mode support, Control and Status Registers (CSRs), and instructions for returning from trap handlers. I also had to extend the instruction set 
with the necessary compressed instructions.

Another important thing was virtual memory. xv6 uses Sv32, RISC-V's 32 bit virtual memory scheme, which translates virtual addresses into physical addresses using a two level page table structure. Specula implements this translation for instruction fetches and load/store accesses through a page-table walk. 
This allowed the processor to execute software using virtual addresses rather than requiring every program to operate directly on physical memory. There is still room for improvement here: Specula performs the page-table walk on each relevant access and does not currently implement a TLB.

And finally, whenever the operating system needed to tell me something's wrong, it needed certain necessary system components around Specula. This included a UART for console input/output, a Platform-Level Interrupt Controller (PLIC) to manage device interrupts, and a VirtIO block device to provide disk access. 
The VirtIO device is implemented as a behavioural DMA model, while the PLIC handles interrupts from the UART and VirtIO device. 

With everything now in place, I was able to boot xv6-rv32 in Bluesim, reach its interactive shell and exercise basic filesystem operations. 

![xv6](https://i.postimg.cc/kG90RCHn/xv6.png)

> xv6-rv32 running on Specula in Bluesim. The system successfully boots into its interactive shell and supports basic filesystem operations, including creating directories, listing files, and writing to and reading from files.

---

## Taking Specula to FPGA

As promised, that was the last of the lectures for my dear audience. So to recap, we have a functioning Out of Order RISC-V machine that can boot xv6 at a decent level. But this is all just in simulation, and it's not the best place to hit the brakes. I wanted to see how Specula would look like when translated into 
actual FPGA hardware. So I took it through a Vivado synthesis flow targeting the [Artix-7 XC7A35T](https://www.amd.com/en/products/adaptive-socs-and-fpgas/fpga/artix-7.html). A design that works perfectly well in simulation doesn't necessarily translate into an efficient hardware implementation. The new headaches 
for me right now are LUT counts, flip flop counts, and most importantly, the critical timing paths. 

![basys3](https://i.postimg.cc/ncKhqX5q/basys3.png)

> This is the Basys3 FPGA which I had my hands on. It belongs to the Artix-7 family and is a beginner friendly board. 

My initial synthesis results were not "in order". Bad joke, but the early implementation occupied approximately 30,582 LUTs (while the Basys board could hold only about 20,800 LUTs) and its estimated maximum operating frequency was only around 11.9 MHz (meaning it is as slow as a herd of snails traveling through peanut butter).
Clearly, there was plenty of room for improvement. So I did a series of experiments involving different parts of the microarchitecture, where I tried to understand which structures were consuming the most resources and which logic paths were limiting the clock frequency. Some of these experiments worked beautifully, others 
made things worse, and a few taught me that the seemingly obvious optimization isn't always the right one. 

---

## Making Specula Fit

So now we are getting into the actual meat of the story and I hope you have refilled your coffee, as I believe the next two sections are all about me doing magic. We saw how my design occupied around 30,582 LUTs and had a WNS (Worst Negative Slack) of -73.8 ns against a 10 ns (which is 100 MHz) clock constraint. The worst critical 
path was through the combinational divider. In Bluespec, writing `a / b` and `a % b` is wonderfully convenient, but the resulting hardware was a large combinational division network, creating a very deep logic path. 

Alright, so what can be done? Well, I replaced it with an iterative radix-2 restoring divider. Now instead of trying to produce the quotient and remainder in a single combinational operation, the divider instead performs the calculation over 32 iterations, reusing the same hardware. 
This traded execution latency for a considerably smaller implementation. `DIVU` and `REMU` now share the same divider, and the ALU waits while a division is in progress. This brought LUT usage down from 30,582 to 28,276 and improved WNS from -73.8 ns to -46.7 ns. 

![Combinational vs iterative radix-2 restoring divider](/images/specula-divider-optimization.svg)

> A comparison of Specula's original combinational divider and the iterative radix-2 restoring divider.

The next bottleneck was the logic responsible for selecting the oldest ready memory operation from the Memory Queue. The original implementation uses a serial chain of age comparisons across all eight entries, meaning each comparison depended on the result of the previous one. I replaced this with a balanced three-level comparison tree, 
reducing the logic depth from 70 to 57 levels. This dropped LUT counts by 1,970 and improved WNS by 11.8 ns. I further optimized this structure by replacing the tree with an all-pairs comparison network that identifies the oldest eligible entry using a one-hot selection mask. This was introduced alongside a split between memory selection 
and memory issue, allowing the selection result to be registered before the rest of the memory pipeline proceeded.

![Memory selector evolution](/images/specula-memory-selection.svg)

> Evolution of Specula's Memory Queue selector, from a serial comparison chain to the final all-pairs one-hot selection network.

Another thing that needed attention was Store Queue forwarding. When a load accesses memory, it must account for older stores that may already contain some or all of the requested bytes. My original implementation used a serial priority chain to identify the youngest matching store for each byte lane. I restructured this into a balanced selection tree, 
trading an additional 1,018 LUTs for a 7.2 ns improvement in WNS. I then went a step further and changed how stores were ordered: instead of repeatedly comparing ROB tags, I used their relative positions in the Store Queue. Since entries are allocated and retired in program order, their queue positions provide the ordering information needed for the currently active entries.

This eliminated the ROB-tag age comparisons and an additional eight-way lookup in the store execution path. The result was a reduction of 1,241 LUTs and a further 6.0 ns improvement in WNS. This brought the design down to 20,382 LUTs, finally fitting within the Basys 3's 20,800 LUT capacity. 

![Store Queue forwarding and ordering](/images/specula-store-queue-optimization.svg)

> Optimizing Store Queue forwarding and replacing ROB-tag-based age comparisons with relative Store Queue positioning.

---

## Chasing Timing in FPGA Synthesis 

Well, I did it! I made Specula fit inside the available room and obviously the earlier fixes were not the only ones that made it happen. Along the way, I experimented with several microarchitectural optimizations which greatly contributed to the final synthesis results of Specula. 

Reducing the Reorder Buffer was one of the highlights. All I did was reduce the Reorder Buffer from 64 entries to 32. I chose to target the Reorder Buffer because the original 64 entry was more capacity than this design needed, and reducing its depth also reduced the amount of state and associated logic 
required to track in-flight instructions. This change reduced LUT usage by a whopping 5,701 and flip flop usage by 3,837 and improved WNS by 0.8 ns. A substantial area reduction without a meaningful timing penalty. 

In any computer architecture lecture, you would always hear people telling how one of the best techniques to optimize a design is by pipelining it. Simply put, pipelining is a technique where you chop the big task into smaller, sequential steps where each step does only one specific job. The moment step 1 finishes its piece, it passes it to step 2 and instantly 
grabs the next raw piece. Because each stage passes its work forward and immediately starts the next one, nobody stands around waiting and each stage (step) remains busy at the exact same time. So I did the same! I restructured the memory pipeline where initially, selection, address generation and memory issue were more tightly coupled, creating long combinational paths.
I split the pipeline so that selecting an eligible memory operation and issuing it were no longer part of one long combinational sequence. Of course, this introduced additional staging but improved WNS from approximately −20.9 ns to −7.0 ns after the initial split. A later separation around address generation brought another improvement, along with a reduction of roughly 594 LUTs.

![Specula memory pipeline](/images/specula-memory-pipeline.svg)

> The restructured memory pipeline, separating operation selection, address generation, and memory issue into distinct stages.

The frontend and dispatch logic needed some looking too. On the fetch and translation side, I made a few targeted changes, including registering paging-related state and restructuring how the page-table root address was handled. I also rechecked the structures in dispatch. The physical register free list originally needed to identify an available register, so I reworked its selection logic into a balanced two-level 8×8 picker.

![Specula frontend and dispatch structures](/images/specula-frontend-dispatch.svg)

> Frontend and dispatch optimizations in Specula, covering Sv32 address translation, fetch predecode, and physical register allocation.

---

### Other Optimizations and Experiments

<table style="border-collapse: collapse; width: 100%; font-size: 0.95em; line-height: 1.6; margin: 20px 0;">
  <thead>
    <tr style="border-bottom: 1px solid #444;"><th align="left" style="padding: 8px;">Optimization</th><th align="left" style="padding: 8px;">Outcome</th></tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Reservation Station <code>notFull</code> logic</td><td style="padding: 8px;"><strong>Kept.</strong> Improved WNS from −1.24 to −0.57 ns, at a cost of 313 LUTs.</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">DSP48E1 PREG integration</td><td style="padding: 8px;"><strong>Kept.</strong> Absorbed the multiplier result register into the DSP's internal pipeline register.</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">MMU address concatenation</td><td style="padding: 8px;"><strong>Kept.</strong> Replaced address adders with concatenation, saving 124 LUTs.</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Memory Queue operand capture</td><td style="padding: 8px;"><strong>Rejected.</strong> Increased LUT usage by 934; the 64:1 register read simply moved to dispatch.</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">ROB entry slimming (133 → 96 bits)</td><td style="padding: 8px;"><strong>Rejected.</strong> Saved 1,162 flip-flops but increased LUT usage by 1,036.</td></tr>
    <tr><td style="padding: 8px;">Physical register file (64 → 48 entries)</td><td style="padding: 8px;"><strong>Rejected.</strong> Reduced flip-flops by 521 but increased LUT usage by 120.</td></tr>
  </tbody>
</table>

Yeah if I really wrote down each one of the optimizations that I tried on Specula, this would probably turn into a research thesis document. But I guess the point really is to try and identify where an existing mechanism creates unnecessary work and ask if that work can be restructured in an efficient way.

After all these optimizations, I finally had a design that came remarkably close to fitting the target timing constraint. The final Vivado synthesis reported 19,675 LUTs, 12,466 flip-flops, and 3 DSP48E1 blocks, with no BRAM inferred. That's 94.59% of the Basys 3's nominal LUT capacity of 20,800. Against a 10 ns clock constraint (100 MHz),
the design reported a WNS of −0.115 ns, with just one failing timing endpoint. 

The critical path had moved quite far from where we began. It was no longer the processor's execution pipeline, but instead it ran through an address calculation in the VirtIO device model. 

> [!NOTE]
> These are post-synthesis results, not a placed-and-routed implementation. The RAM and disk image were black-boxed, and simulation-oriented logic was still present in the design. So while the synthesized LUT count is below the Basys 3's nominal capacity, this does not establish that the complete system fits on the board or can run there at 100 MHz.


---

## Climax

Yup, Specula genuinely was one of the most challenging things I've attempted so far. There were plenty of moments where I had absolutely no idea what I was doing, and honestly, that was probably the most valuable part of the entire experience. There is still plenty to explore in Specula, but I can't promise I will be exploring it any time soon. 

As for you, since you have made it this far, there's something I do have. If you want to spend the next few hours in the weeds of microarchitecture, timing and out-of-order execution, these are the places I would start.

- [Tomasulo's algorithm](https://en.wikipedia.org/wiki/Tomasulo%27s_algorithm) is the original idea behind reservation stations and dynamic scheduling, and it's where the "results can arrive whenever they like" behaviour comes from.
- The [Vivado Design Methodology guide (UG949)](https://docs.amd.com/r/2025.2-English/ug949-vivado-design-methodology) from AMD is a good read on how to think about logic levels, fan-out and register placement before you ever open a text editor, if you want to design for a high Fmax from the start.
- [*Modern Processor Design*](https://www.waveland.com/browse.php?t=624) by John Paul Shen and Mikko Lipasti is the textbook I would reach for on pipelines, store forwarding and speculation inside real out-of-order cores.
- [Out-of-order execution, register renaming and retirement](https://os.christiansoftware.org/en/02-computer-architecture/out-of-order-renaming-retirement/) is a fantastic deep dive on Out of Order execution and he has many more gems on similar content.

And if you spend weeks balancing pipelines, rebuilding comparison trees and fiddling with register ports, and the hardware still refuses to hit your clock target, there is always the ultimate optimization strategy.

[![xkcd 378: Real Programmers](https://imgs.xkcd.com/comics/real_programmers.png)](https://xkcd.com/378/)

> Real programmers use butterflies.
