---
title: "TIL: RowClone - Copying Data Entirely Inside DRAM"
date: "2026-06-23"
description: "A fascinating Processing-in-Memory technique that performs bulk data copy inside DRAM by exploiting row buffer behavior, eliminating unnecessary data movement through the CPU."
collections:
  - til
---

# RowClone - Copying Data Entirely Inside DRAM

I have recently been reading about [Onur Mutlu's Primer on Processing-in-Memory](https://arxiv.org/abs/2012.03112) and one of the most fascinating Processing-Using-DRAM (PUM) ideas I came across recently is [RowClone](https://users.ece.cmu.edu/~omutlu/pub/rowclone_micro13.pdf).

Modern systems perform a memory copy by moving data from DRAM, across the memory bus, through the CPU/cache hierarchy, and then back to the DRAM. Even though copying data requires no actual computation, 
it still consumes enormous amount of bandwidth and energy, while introducing significant latency. 

Prior work showed that operating systems, databases and large scale services spend a surprising amount of time performing bulk data movement operations such as `memcpy` and `memset`. Google reported that nearly 
5% of execution time in some datacenter workloads was spent in just these two functions. Operations such as Linux's `fork()`, Memcached, and MySQL all frequently perform memory copying or initialization. 

RowClone exploits a simple property of DRAM. When a row is activated, the entire row is already loaded into the row buffer (sense amplifiers). If two rows reside in the same subarray, the memory can issue back-to-back row activations:
first for the source row and then for the destination row. Since the sense amplifiers hold the source row's contents and are much stronger than the DRAM cells themselves, the destination row is overwritten 
with the source row's data.

This way, the DRAM performs the copy internally without sending over the data over the memory bus or getting the CPU involved. 

The results were quite impressive: RowClone demonstrated more than 11x lower latency and more than 70x lower energy for a `4KB` page copy, while requiring almost no additional DRAM area. 

RowClone is interesting because it isn't about computation, it's recognizing that data movement itself is expensive, and that eliminating unnecessary movement can be just as valuable as accelerating arithmetic. 

The idea also had a lasting impact on memory systems research. Follow-on work such as [LISA](https://users.ece.cmu.edu/~omutlu/pub/lisa-dram_hpca16.pdf) (stands for Low-Cost Inter-Linked Subarrays) improved inter-subarray data movement, while later 
PIM proposals such as [Ambit](https://www.microsoft.com/en-us/research/wp-content/uploads/2017/09/MICRO-50_347.pdf) (stands for **A**ccelerator-in-**M**emory for bulk **Bit**wise operations), [SIMDRAM](https://arxiv.org/abs/2105.12839), 
[MIMDRAM](https://arxiv.org/abs/2402.19080) explored whether DRAM could perform not just copies, but true computation using its native operating principles. 

> [!TLDR]
> If the data is already inside memory, maybe it never needed to leave in the first place :)
