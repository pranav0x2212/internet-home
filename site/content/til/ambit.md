---
title: "TIL: Ambit - When DRAM Accidentally Becomes a Logic Gate"
date: "2026-06-25"
description: "A Processing-in-Memory technique that exploits charge sharing in DRAM to perform bulk bitwise operations entirely inside memory."
collections:
  - til
---

# Ambit - When DRAM Accidentally Becomes a Logic Gate

As I read further into [Onur Mutlu's Primer on Processing-in-Memory](https://arxiv.org/abs/2012.03112), I came across another fascinating Processing-Using-DRAM (PUM) mechanism called  [Ambit](https://www.microsoft.com/en-us/research/wp-content/uploads/2017/09/MICRO-50_347.pdf)
(stands for **A**ccelerator-in-**M**emory for bulk **Bit**wise operations). 

Many modern applications perform large numbers of bitwise operations on massive datasets. These include bitmap indices in databases, graph analytics, genome sequencing, web search filtering, and cryptographic algorithms. 
Traditionally these operations require data to be moved from DRAM to the CPU, processed, and then written back to the memory. 

Ambit moves differently just like any idea of Mutlu's does: instead of moving the data to the computation, it does the computation inside DRAM directly. 

The intuition behind Ambit is that when multiple DRAM cells are connected to the same bitline simultaneously, charge sharing causes the final bitline voltage to depend on the majority value stored across those cells.
Ambit exploits this behavior through a mechanism called Triple Row Activation, where three rows are activated at the same time. 

The DRAM sense amplifiers naturally compute a majority function based on the charge contributions of the three cells. The clever part is that by fixing one of the rows to a known value, the majority function can be transformed
into familiar Boolean operations. If one row is initialized to all zeros, the operation behaves like a bitwise `AND`. If the row is initialized to all ones, the operation behaves like a bitwise `OR`. 

Since each sense amplifier contains cross coupled inverters, both a value and its complement exist internally during sensing. By adding a special row capable of capturing the complementary value, Ambit can efficiently 
perform bitwise `NOT` operation as well. 

With these three primitive logic gates, any Boolean operation can be constructed entirely inside the DRAM. 

The results are impressive: Ambit showed up to 44x higher throughput for bulk bitwise operations compared to a contemporary Intel Skylake processor while also significantly reducing energy consumption. Database 
systems built around bitmap operations also observed substantial query-speed improvements. 

So [Rowclone](https://prawns.dev/til/rowclone) taught us memory can move data by itself and now Ambit says "sheeesh, memory can compute as well". 

> [!TLDR]
> Sometimes the hardware is more capable than the abstraction layers built on top of it. 
