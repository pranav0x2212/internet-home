---
title: "TIL: UPMEM - Bringing Processing-in-Memory Out of the Lab"
date: "2026-07-01"
description: "The first commercially available Processing-in-Memory architecture."
collections:
  - til
---

# UPMEM - Bringing Processing-in-Memory Out of the Lab

Engineers love seeing their ideas and designs come to life. By now, we have seen multiple architectures like [Tesseract](https://prawns.dev/til/tesseract) and [PEI](https://prawns.dev/til/pei) but one question any of us genuinely would have 
is whether: Hmm... cool, but has anyone actually built one?

> [!Surprise]
> Yep, very much so!

[UPMEM](https://arxiv.org/pdf/2105.03814)  is the [first commercially available](https://www.upmem.com/) Processing In Memory architecture. Instead of treating DRAM as passive storage, every DRAM bank is paired
with a tiny processor called a DRAM Processing Unit (DPU). Each DPU owns its local memory bank and executes programs directly beside the data it stores. 

The philosophy is similar to Tesseract:

> Move computation to data instead of moving data to computation.

But unlike Tesseract, which primarily explored the architectural idea, UPMEM brings that philosophy into real DDR4 DIMMs that can be installed into real systems. Each memory chip contains eight DPUs, each with its own instruction 
memory, scratchpad memory and direct access to a 64MB bank. Thousands of these DPUs can execute in parallel, allowing memory bound workloads to scale naturally across memory banks.

These DPUs are intentionally simple. They excel at workloads dominated by memory access and lightweight operations, but they are far less suited for heavy arithmetic or communication intensive programs. Since DPUs cannot communicate 
directly with one another, coordination happens through the host CPU.

UPMEM proves that programmable Processing Near Memory can move beyond research papers and into real hardware. 

> [!Tldr]
> Great architectures don't just live in research papers. They eventually become hardware 🤟 
