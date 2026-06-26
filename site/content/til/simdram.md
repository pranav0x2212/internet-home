---
title: "TIL: SIMDRAM - Turning DRAM Into a Programmable SIMD Engine"
date: "2026-06-26"
description: "A Processing-in-Memory framework that transforms Ambit's logic primitives into programmable computation."
collections:
  - til
---

# SIMDRAM - Turning DRAM Into a Programmable SIMD Engine

After reading [RowClone](https://prawns.dev/til/rowclone) and [Ambit](https://prawns.dev/til/ambit), as we progress in the Processing-Using-Memory saga I wanna introduce you guys to a framework called [SIMDRAM](https://arxiv.org/abs/2105.12839). 

If we recall from Ambit, it demonstrated that DRAM can perform logic operations using two primitive operations: Majority(MAJ) and NOT. Since MAJ and NOT form a functionally complete set, in theory any Boolean function could be
implemented inside the DRAM. 

> [!IMPORTANT] 
> But how do we actually program such a system? 

SIMDRAM fills this missing layer between a programmer's operation and the underlying DRAM substrate. 

Instead of designing new computational circuitry, SIMDRAM takes a user-defined operation (like add, mul, comparision or even neural network primitives) and converts it into an optimized network of MAJ and NOT operations. 
This network is then translated into a sequence of DRAM commands that are executed directly inside the memory. In a way, it could be said SIMDRAM treats Ambit's MAJ and NOT operations like an ISA.

Conventional systems use a horizontal data layout but SIMDRAM says "yeah nope lol give it vertical thx". This layout enables efficient bit-shift operations using RowClone, which are essential to implementing arithmetic operations
without introducing additional hardware into the DRAM. 

To bridge the gap between traditional systems and this vertical layout, SIMDRAM introduces a transposition unit between the CPU cache hierarchy and the memory controller. As the name suggests, it just converts
horizontally laid out data into the format required by the in-DRAM computation. 

> [!TLDR]
> RowClone: Memory can move data, Ambit: Memory can perform logic, SIMDRAM: Memory can be a programmable computing substrate. 
