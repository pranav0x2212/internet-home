---
title: "Building HADES: Searching for Similarity in Silicon"
date: "2026-10-10"
tags:
  - hardware
  - VLSI
  - computer-architecture
  - processing-near-memory
  - tiny-tapeout
  - open-source-silicon
description: "A programmable processing-near-memory engine for binary similarity search, built around a tiny instruction set and an idle memory port."
permalink: posts/{{ title | slug }}/index.html
author_name: M Pranav
author_link: "https://github.com/pranav0x2212"
collections:
  - blogs
---

## A Constrained Place to Build a PNM Engine

I wanted to build a processing-near-memory (PNM) engine, and I wanted the project constrained enough that I couldn't hand-wave anything. [Tiny Tapeout](https://tinytapeout.com/) does that nicely: a 2×2 tile, eight input pins, eight output pins, a fixed flow and a very visible area budget. HADES is my second project on it, after [Herald](https://prawns.dev/blogs/herald), and the tile is what turned a vague idea into a list of decisions. If you read my [memory wall](https://prawns.dev/blogs/memory-wall) posts you know why: moving data is usually the expensive part, and the arithmetic done on it is the cheap part.

The result is [HADES](https://github.com/pranav0x2212/HADES) (Hamming-Aware Decode, Execute, and Search). It keeps a small set of stored records, takes a query, and does the comparison right next to where the records live, so only a short answer has to leave the chip. The memory cells are never modified or computed in. All the logic sits beside them, which is why I call it near-memory and not in-memory.

> [!NOTE]
> The design is hardened for the Tiny Tapeout flow and will be fabricated through it, but no silicon exists yet, so nothing in this post is a silicon result. Every HADES cycle count comes from RTL or gate-level simulation, converted to time at a specified 40 MHz clock, and HADES energy is an estimate. The microcontroller numbers I compare against are measurements on real boards.

---

## What the Engine Is Asked to Do

Picture a handful of stored records, each one a 32-bit string of ones and zeros. Think of them as short fingerprints of something. A query arrives, which is another 32-bit string, and the question is which stored records look like it.

The usual way to measure "looks like" for bit strings is the [Hamming distance](https://www.ibm.com/think/topics/hamming-distance), which is just the number of positions where two strings differ. The strings 10110 and 10011 differ in two places, so their distance is two. A distance of zero means they are identical. To compute it you XOR the two strings, which gives a one wherever they differ, and then count the ones. Counting ones is called a popcount.

There is one more ingredient, the mask. It is another 32-bit string that says which positions count, and positions where the mask is zero are ignored. That lets the same stored data be compared on a chosen subset of its bits.

With that, the questions are easy to state:

- **Nearest:** which stored record has the smallest distance to the query?
- **Within a threshold:** which records are no further than some limit?
- **Equal:** which records match the query exactly, as far as the mask can see?

A scan has to read every stored record, but the answer is tiny: an index and a distance, or a short list of matching rows. That mismatch between what is read and what is returned is what makes this a near-memory workload. It is a ratio of record sizes, and I never measured it as a speedup.

All of these questions share the same XOR-and-count datapath and differ only in what they do next, so a fixed-function unit would answer exactly one of them. The real question became how little instruction storage and control it takes to make the engine programmable, on a tile where every square micron is visible.

---

## The Area Problem

The obvious home for the records was an SRAM macro. I hardened a stub design on the 2×2 tile with the smaller of the two SRAM macros I tried, `sky130_sram_1rw_tiny` (16 words of 32 bits). The macro alone takes about 45,000 µm², roughly 60% of the tile's die area, which leaves about 27,000 µm² of free core, and only part of that is usable for standard cells at a normal target density.

An earlier version of HADES used that macro for the data and a separate flip-flop array for the program, and it needed a 4×2 tile, because the logic plus the macro did not fit in a 2×2 core. A tile that big is a different project from the one I wanted.

The way out was a macro that already existed in the Tiny Tapeout ecosystem: `rf_top`, written by [Sylvain Munaut](https://www.youtube.com/c/SylvainMunaut). It is a register file with 32 words of 32 bits, two read ports, one write port and one-cycle synchronous reads, and it takes about 15,744 µm², roughly a third of the SRAM macro. It holds as many bits as the SRAM data store and the program array put together, so the dataset and the program could live in the same thing. I instantiate it unmodified, through its ordinary ports, and the macro never knows which of its words are data and which are instructions.

---

## One Macro, Two Jobs

The split is simple. Words 0 to 15 are the sixteen data rows. Words 16 to 31 are the program, two 16-bit instructions per word, for 32 instruction slots. Data and program each get 64 bytes, a 1:1 split that just follows from the macro's flat layout.

![HADES memory map](/images/hades_memory_map.svg)

> Left: the shared macro divided into data rows and program words. Right: the three ports and what each one carries.

Sharing the macro saves area, but it forced a few decisions that two separate memories would not have:

- **Fetch and data reads must not collide.** The macro has two read ports. Port B carries data rows to the datapath. Port A carries instruction fetch, addressed with the next program counter so that the synchronous read returns the instruction in time for the cycle that executes it.
- **One write port has three users.** The program loader, the post-reset initialisation and the store instruction all write through it, with a fixed priority in that order.
- **Reset has to treat the halves differently.** After reset the engine spends 16 clocks refilling every program slot with `HALT`, while data rows survive.
- **Data arrives through the same door as everything else.** There is no separate load path, so rows get into the macro by running a program that receives bytes and stores them. That comes back later in this post.

![HADES block diagram](https://raw.githubusercontent.com/pranav0x2212/HADES/main/docs/hades_block_diagram.png)

> The wrapper, the core and the single `rf_top` macro.

One side benefit: a store instruction can write the accumulator back into a data row and a later load can bring it back, so multi-pass programs keep intermediate values in spare rows without involving the host.

---

## A Small Instruction Set

With the memory settled, the instruction set had to stay small so that control would not dwarf the datapath. Instructions are 16 bits, a four-bit opcode and three four-bit fields, with twelve opcodes defined and four reserved. The programmer sees a query register, an accumulator and a mask (32 bits each), a few result registers and a five-bit program counter.

<table style="border-collapse: collapse; width: 100%; font-size: 0.95em; line-height: 1.6; margin: 20px 0;">
  <thead>
    <tr style="border-bottom: 1px solid #444;"><th align="left" style="padding: 8px;">Group</th><th align="left" style="padding: 8px;">What it does</th></tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Register movement</td><td style="padding: 8px;">Fill the query, accumulator or mask from a row or from the host, write the accumulator back to a row, reset the mask</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Scan</td><td style="padding: 8px;">Three variants, the only way to use the datapath</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Output</td><td style="padding: 8px;">Put a selected register on the pins, one byte per cycle</td></tr>
    <tr><td style="padding: 8px;">Control</td><td style="padding: 8px;">Conditional branch and halt</td></tr>
  </tbody>
</table>

What keeps it small is that every question above is the same scan with a different thing being kept. A scan walks a range of rows in ascending order and applies one of eight operations:

<table style="border-collapse: collapse; width: 100%; font-size: 0.95em; line-height: 1.6; margin: 20px 0;">
  <thead>
    <tr style="border-bottom: 1px solid #444;"><th align="left" style="padding: 8px;">Operation</th><th align="left" style="padding: 8px;">What it answers</th></tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Nearest</td><td style="padding: 8px;">The row with the smallest distance, and that distance (lowest index wins ties)</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Nearest-two</td><td style="padding: 8px;">The two closest rows and their distances</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Within-threshold</td><td style="padding: 8px;">The nearest row, plus a bitmap and count of every row at or under a distance limit</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Equal</td><td style="padding: 8px;">A bitmap and count of rows that match the query under the mask</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">OR</td><td style="padding: 8px;">The bitwise OR of all masked rows, which is every position that is set in any row</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">AND</td><td style="padding: 8px;">The bitwise AND of all masked rows, which is every position that is set in every row</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Popcount-sum</td><td style="padding: 8px;">The total number of set bits across all masked rows</td></tr>
    <tr><td style="padding: 8px;">Argmax-popcount</td><td style="padding: 8px;">The row with the most set bits under the mask, and that count</td></tr>
  </tbody>
</table>

Everything else in a program is moving bytes in, moving bytes out and deciding what to do next. The resident nearest-neighbour program is four receives for the query, one scan over sixteen rows, two sends and a branch back to the start. All ten workloads I defined fit in the 32 slots, the longest (filter-and-refine) using 19. So 32 slots was enough for the workloads I tested.

---

## The Idle Port Becomes SCANP

Allocating the ports exposed a leftover. During a scan, port A does nothing except fetch the next instruction, while the scan reads one data row per cycle through port B. A second read port sits idle next to a loop that is limited to one row per cycle.

The catch is what happens to a row once it is read. Nearest, nearest-two and within-threshold all need a distance per row, which means a popcount per row, and the popcount tree is the expensive part of the datapath. Two rows per cycle would mean two trees. But three of the eight operations never need to count anything:

- **Equal** only asks whether the masked XOR is all zeros. A zero detector is enough.
- **OR and AND** just combine masked row values bit by bit. There is no counting at all.

So `SCANP` reads a second row through port A for those three operations only. The second row goes through its own copy of the masking logic and its own zero detector, and the OR and AND folds take both rows. Sixteen rows take 9 cycles instead of 17. For every other operation `SCANP` behaves exactly like a plain scan, because the single popcount tree is the limit. So nearest and threshold searches get nothing from it.

![Scan timeline](/images/hades_scan_timeline.svg)

> The same sixteen rows through `SCAN` and through `SCANP`. Port A carries the second row only when the operation needs no popcount.

---

## SCANSEL: Keeping Filter-and-Refine On Chip

`SCANP` speeds up a single pass, but it does nothing for a query made of two passes. A common query shape is filter and refine: find the rows that match this key, then find the nearest among only those. The first scan already produces a 16-bit `MATCH` bitmap, one bit per row, but nothing in the instruction set can use it. The intermediate answer would have to leave the chip and the second stage would be driven from outside.

`SCANSEL` makes that bitmap an operand. It runs the same operation, but only over the rows whose `MATCH` bit was set when the instruction issued, in ascending order. A selection of k rows takes 1 + k cycles. So the whole query stays inside the engine: an equality scan builds the bitmap, a new query is received, and the `SCANSEL` nearest scan visits only the selected rows.

![Filter and refine](/images/hades_scansel.svg)

> An equality scan builds the bitmap, and `SCANSEL` then visits only the selected rows.s

---

## Eight Bits at a Time

Everything so far is about the inside, and the pins decide the rest. Data moves in and out of HADES one byte per clock. A receive instruction stalls until the host supplies a byte, so a 32-bit operand takes four of them. A send puts one byte on the output pins for one cycle, with no hardware flow control.

This is where loading data through the program comes back. Writing a 32-bit row takes four receives and a store, so a program can hold at most six rows, and a sixteen-row dataset needs three successive programs, each preceded by a reset and followed by an execute. That is 478 clocks to load one tile, and the loop program adds another 50 to 94.

![Loading versus a resident query](/images/hades_query_paths.svg)

> Loading a tile against one resident nearest query. The first two bars share a clock scale.

Once the dataset is resident the picture changes. A nearest query is 24 clocks: four receives, the 17-cycle scan, two sends and a branch, which is 600 ns at 40 MHz. Seven of those 24 clocks are interface, and a tile load costs about as many clocks as 22 such queries. So the narrow interface shapes performance in two places. It is a fixed tax on every query, and it is most of the cost of a single query that has to load its dataset first.

---

## What the Tile Looked Like

The RTL is written in [Veryl](https://veryl-lang.org/), which generates the SystemVerilog that goes through simulation and the Tiny Tapeout flow on SKY130.

![HADES GDS render](https://raw.githubusercontent.com/pranav0x2212/HADES/main/docs/hades_gds.png)

> The final layout. The register file macro is the large block, and the rest is standard cells and routing.

The design closes timing at 40 MHz in all nine analysed corners and passes DRC, LVS and antenna checks. The 25 ns period is a specification the timing analysis closes, and every HADES time here is a cycle count multiplied by 25 ns. The standard cells take about 26,968 µm², roughly 1.7 times the macro, even though the datapath itself is only a masked XOR and a popcount.

---

## What the Numbers Say

I compared HADES against plain C kernels on three microcontrollers: an ESP8266 (80 MHz), an ESP32 (240 MHz) and an Arduino Nano (16 MHz, 8-bit). All three were checked against the same expected results, byte for byte.

The Nano did not run everything. It has 2 KB of RAM and 32 KB of flash, so it runs only the kernel-only set (up to 64 rows), the resident-query sets up to a batch of 16, and two mask-related sets. The filter-and-refine and end-to-end sets do not build for it, so it appears below only where it ran.

I keep three measurement boundaries apart. Kernel only is the scan itself. Resident query is one query with the dataset and program already loaded (bytes in, scan, bytes out). End to end adds loading the dataset and program, for a batch of queries. Here is the 16-row nearest workload:

<table style="border-collapse: collapse; width: 100%; font-size: 0.95em; line-height: 1.6; margin: 20px 0;">
  <thead>
    <tr style="border-bottom: 1px solid #444;"><th align="left" style="padding: 8px;">Boundary</th><th align="left" style="padding: 8px;">HADES</th><th align="left" style="padding: 8px;">ESP8266</th><th align="left" style="padding: 8px;">ESP32</th><th align="left" style="padding: 8px;">Nano</th></tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Kernel only</td><td style="padding: 8px;">425 ns</td><td style="padding: 8px;">12.8 µs</td><td style="padding: 8px;">5.19 µs</td><td style="padding: 8px;">171.7 µs</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">Resident query (batch of 16)</td><td style="padding: 8px;">600 ns</td><td style="padding: 8px;">16.7 µs</td><td style="padding: 8px;">6.02 µs</td><td style="padding: 8px;">245.7 µs</td></tr>
    <tr style="border-bottom: 1px solid #2a2f3a;"><td style="padding: 8px;">End to end, 1 query</td><td style="padding: 8px;">13.9 µs</td><td style="padding: 8px;">22.4 µs</td><td style="padding: 8px;">8.76 µs</td><td style="padding: 8px;">not run</td></tr>
    <tr><td style="padding: 8px;">End to end, 256 queries</td><td style="padding: 8px;">167 µs</td><td style="padding: 8px;">4,271 µs</td><td style="padding: 8px;">1,542 µs</td><td style="padding: 8px;">not run</td></tr>
  </tbody>
</table>

The HADES figures are RTL cycles with an ideal host that supplies and consumes bytes without delay, so they should be compared within a row only. In simulation, adding 15 idle clocks after each received byte raises a nearest query from 24 to 69 clocks.

The resident-query numbers show where HADES's compute advantage lies, though the ESP timings also include query decoding, serialisation and hashing, which HADES does not perform. The speedup figures are therefore upper bounds. For nearest, the estimated hash-free speedup is roughly 22–28× against the ESP8266 and 9–10× against the ESP32.

Once loading the dataset and program is counted, a single query loses to the ESP32, but across 256 queries HADES takes 167 µs against the ESP32's 1,542 µs. Across the end-to-end workloads, HADES wins 52 of 60 cases against the ESP8266 and 40 of 60 against the ESP32. The load is paid once and shared across the batch.

`SCANP` saves eight clocks on a resident equality query. That is a small gain for a one-off query, but it matters more when the dataset stays loaded and queries repeat. All these results come from simulation, not fabricated silicon.

> The purpose of computing is insight, not numbers.
>
> — Richard Hamming, *Numerical Methods for Scientists and Engineers* (1962)

---

## What This Doesn't Show

- **No silicon.** HADES timing is simulation, and I did not measure a real board interface or host.
- **Plain-C baselines.** I did not run tuned or SIMD baselines, and there is no higher-performance host in the comparison. The evaluation does not show that a conventional host pays a data-movement penalty that this design avoids.
- **Energy.** HADES energy is a simulation estimate and the boards' power is measured. They cover different things, so I make no energy-efficiency claim.
- **One design point.** The instruction set is enough for these workloads, and I did not test whether a smaller one would do. Gate-level runs matched RTL on the cases I ran, which is not the whole test suite.

What I would most like to learn is how the engine holds up against tuned baselines, and whether a data path that bypasses the program stream would shrink the loading cost that dominated the end-to-end numbers. That would be a different design, and I have not built it.

The full ISA, cycle model, verification and evaluation methodology are in the paper.

Thank you to the [Tiny Tapeout](https://tinytapeout.com/) team and community for building an open flow that makes projects like this possible, and to Sylvain Munaut for the [`rf_top` register-file macro](https://tinytapeout.com/chips/ttsky25a/tt_um_tnt_rf_test) that the whole design is built around. The port-allocation story above only exists because there was a shared macro to build on.

---

## Down the Rabbit Hole

If this project got you interested, here are a few places to continue down the rabbit hole.

- [A Modern Primer on Processing in Memory](https://arxiv.org/abs/2012.03112): a readable survey of the whole field, and the best place to start if processing-in-memory is new to you.
- [Crossing the Layers and Dotting the Details: Systematic Exploration of Near-Memory Computing](https://isqed.org/English/Archives/2026/Technical_Sessions/122.html): a way to evaluate near-memory processing units inside full-system simulation, which is the question my small cycle-level model only touches.
- [Computing's Energy Problem (and what we can do about it)](https://pages.cs.wisc.edu/~markhill/restricted/isscc2014_horowitz_power_scaling.pdf): the ISSCC 2014 plenary that explains why power became the limit on performance, and why moving data is the part worth attacking.
- [Ambit: In-Memory Accelerator for Bulk Bitwise Operations Using Commodity DRAM Technology](https://doi.org/10.1145/3123939.3124544): bulk AND, OR and NOT done inside DRAM itself, the same kind of bitwise work HADES does, at a very different scale.
- [Benchmarking a New Paradigm: An Experimental Analysis of a Real Processing-in-Memory Architecture](https://arxiv.org/abs/2105.03814): measurements on real UPMEM hardware, a useful reality check on what processing near memory delivers in practice.
- [Faster Population Counts Using AVX2 Instructions](https://arxiv.org/abs/1611.07612): how far a conventional CPU can push popcount, which is the baseline a Hamming-distance engine has to beat.
- [My TIL notes](https://prawns.dev/collections/til.html): short write-ups from my own reading on [Ambit](https://prawns.dev/til/ambit), [RowClone](https://prawns.dev/til/rowclone), [SIMDRAM](https://prawns.dev/til/simdram), [Tesseract](https://prawns.dev/til/tesseract), [PEI](https://prawns.dev/til/pei), [UPMEM](https://prawns.dev/til/upmem) and processing-using-SRAM, if you want the same material in smaller pieces.
- [Tiny Tapeout](https://tinytapeout.com/): if you want to take your own RTL to fabricated silicon, this is how I did it, and it is a good place to start.

[![xkcd 2565, Latency: a bar chart of typical process latency in which automated steps take under a second and a person copying and pasting data from one thing into another takes minutes](https://imgs.xkcd.com/comics/latency.png)](https://xkcd.com/2565/)

> The scan takes 600 ns. Loading the tile takes 478 clocks, before the loop program even runs. The bottleneck, as usual, is getting the data where it needs to be.
