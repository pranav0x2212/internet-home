---
title: "TIL: Tesseract - When the Processor Moves Next Door to Memory"
date: "2026-06-29"
description: "A Processing-near-Memory architecture for memory bound graph processing."
collections:
  - til
---

# Tesseract - When the Processor Moves Next Door to Memory

After spending the last few days exploring Processing-Using-Memory techniques like [RowClone](https://prawns.dev/til/rowclone), [Ambit](https://prawns.dev/til/ambit), [SIMDRAM](https://prawns.dev/til/simdram) and 
[Processing-Using-SRAM](https://prawns.dev/til/processing-using-sram), it's obvious that they all share the same philosophy:

> Yeah, make the memory itself perform computation. 

But upon changing lanes, we come across [Tesseract](https://users.ece.cmu.edu/~omutlu/pub/tesseract-pim-architecture-for-graph-processing_isca15.pdf) where the question is slightly different:

> Instead of messing with the memory's physics, why can't we move the processor closer to memory?

This idea is formally termed as Processing-Near-Memory. 

Modern workloads such as graph processing spend most of their time moving data around rather than actually computing on it. A graph traversal might fetch a cache line from DRAM only to update a single vertex or check 
whether it has already been visited. Almost like PES calling you to sign the final ISA sheet after your ESAs ended. 

Instead of dragging graph data to the CPU, Tesseract places simple in-order processing cores directly inside the logic layer of [3D-stacked memory](https://www.cs.cmu.edu/~18742/papers/Loh2008.pdf). Since the logic layer sits underneath the DRAM layers and 
communicates through thousands of [Through-Silicon VIAS (TSVs)](https://en.wikipedia.org/wiki/Through-silicon_via), these cores gain extremely high bandwidth, low latency access to the data stored above them. 

Each processing core "owns" a paritioning memory. Rather than fetching data from another partiton, a core simply sends a small message requesting that the remote core perform the computation locally. So functions move
to data instead of data moving to functions. 

I found this design particularly elegant as it resembles distributed systems. Each memory partition behaves almost like a tiny server responsible for its own data. If another processor needs something updated, it sends a 
message instead of transferring entire dataset.

> [!Tldr]
> Sometimes the best way to accelerate memory-bound workloads isn't to build a faster processor, but to stop making data travel so far. 
