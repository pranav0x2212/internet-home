---
title: "TIL: Processing-Using-SRAM - When the Cache Becomes the Processor"
date: "2026-06-27"
description: "A Processing-in-Memory technique that exploits SRAM bitlines and sense amps to perform computation directly inside caches."
collections:
  - til
---

# Processing-Using-SRAM - When the Cache Becomes the Processor

We have seen enough magic happen in DRAM via [RowClone](https://prawns.dev/til/rowclone), [Ambit](https://prawns.dev/til/ambit) and [SIMDRAM](https://prawns.dev/til/simdram). As I progressed in the later chapters of 
the [primer](https://arxiv.org/abs/2012.03112) I came across Processing-Using-SRAM, which asks a different question:

> If DRAM can compute, why not experiment with caches?

Modern CPUs contain tens of megabytes of SRAM spread across its cache hierarchy. Normally these SRAM arrays simply store data and serve it to the CPU. Processing-Using-SRAM techniques instead exploit the 
internal behavior of SRAM arrays to perform computation directly inside the cache itself. 

So it's the same story as Ambit. By simultaneously activating two SRAM rows, the shared bitlines and sensing circuitry naturally perform bitwise operations. When two rows drive the same bitline, the resulting 
voltage depends on the values stored in both cells. The behavior can be exploited to implement Boolean operations such as `AND` and `NOR` directly inside the SRAM array.

What's more cooler is that every SRAM bitline can act as a tiny compute lane. Instead of moving data from cache into execution units, the cache itself becomes a massively parallel SIMD engine.

There are several research projects that build on this idea. [Compute Cache](https://blaauw.engin.umich.edu/wp-content/uploads/sites/342/2018/03/Aga-Compute-Caches.pdf) demonstrates bulk bitwise operations directly inside
processor caches. [Neural Cache](https://blaauw.engin.umich.edu/wp-content/uploads/sites/342/2019/10/Neural-Cache_-Bit-Serial-In-Cache-Acceleration-of-Deep-Neural-Networks.pdf) extends the approach to arithmetic operations
for neural network inference. [Duality Cache](https://par.nsf.gov/servlets/purl/10122498) pushes things further by supporting general purpose data parallel execution using a SIMT-style programming model. 

The major limitation SRAMs face is capacity. A CPU cache may contain about tens of megabytes of SRAM, but the main memory goes up to gigabytes of DRAM. So it's important to understand that SRAM works best when data
is already present in the cache. For very large datasets, moving data into the cache can outweigh the benefits of cache-side computation. 

This does not mean that Processing-Using-DRAM is better than Processing-Using-SRAM. Rather, the two complement each other. Viewed this way, the future is likely to be a memory-centric system containing both of them. Having
computation happen at every level of the memory hierarchy suddenly starts looking a lot like distributed systems! 

> [!TLDR]
> Computation does not always need to happen where we traditionally expect it to. 
