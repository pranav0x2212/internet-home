---
title: "TIL: PEI - Making Near Memory Computing Feel Like a Normal CPU Instruction"
date: "2026-06-30"
description: "A Processing-Near-Memory architecture that introduces PIM-Enabled Instructions."
collections:
  - til
---

# PEI - Making Near Memory Computing Feel Like a Normal CPU Instruction

So [Tesseract](https://prawns.dev/til/tesseract) made one thing obvious:

> Rewriting an entire application to execute near memory isn't exactly easy. 

That is precisely the problem [PIM-Enabled Instructions (PEI)](https://users.ece.cmu.edu/~omutlu/pub/pim-enabled-instructons-for-low-overhead-pim_isca15.pdf) tries to solve. Instead of offloading the entire application, 
PEI says: 

> Hmm, what if we could just offload a single instruction?

Our job as programmers remain the same, we write ordinary C/C++ code. The compiler identifies certain memory-intensive operations (like integer increment, minimum, histogram updates or hash table probing) as good
candidates for PNM and emits them as PIM-Enabled Instructions (PEIs). The decision of where these instructions should eventually execute, however, is left to the hardware at runtime. 

At runtime, a PEI Management Unit (PMU) dynamically decides where each PEI should execute. If the required data is already sitting in the CPU caches, the instruction executes on the CPU. If the data is chilling inside a 3D-stacked
memory, the same instruction can instead execute on a small computation unit placed beside memory. 

PEI preserves the programming model, virtual memory system and cache coherence while allowing the hardware to choose the most efficient execution location, so the programmer can lead a peaceful life. 

Unlike Tesseract, which prioritizes maximum acceleration through coarse-grained application offloading, PEI priortizes adoption by integrating the idea into existing instruction stream with minimal architecture changes.

When viewed this way, Tesseract and PEI are not competing approaches. They simply occupy different points in the design space.

> [!Tldr]
> Sometimes the hardest part of a new architecture isn't making it fast, but making it easy for everyone else to use. 
