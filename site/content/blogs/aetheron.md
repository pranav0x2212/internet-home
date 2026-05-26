---
title: "Aetheron: Bringing My Own SoC to Life"
date: "2025-07-18"
description: "From wires to life: how I built and booted my own System-On-Chip using BlueSpec SystemVerilog"
tags:
  - soc
  - riscv
  - bluespec
customFields:
  - image: "/assets/images/aetheron.png"
---

## Introduction

[Aetheron](https://github.com/pranav0x0112/Aetheron) is a small but complete RISC-V [System-on-Chip](https://en.wikipedia.org/wiki/System_on_a_chip), built entirely in [Bluespec SystemVerilog](https://github.com/rsnikhil/Bluespec_BSV_Tutorial) and run in simulation. It features a pipelined CPU, memory-mapped peripherals, my own minimal TileLink interconnect, and can boot minimal bare metal C programs — all stitched together from scratch.

But it’s more than just a collection of modules.

I’ve always loved the idea of designing systems — not just writing code or building hardware in isolation, but understanding how they blend together. Fortunately, I had the privilege to attend a three-day workshop hosted by my seniors, [Devesh Bhaskaran](https://www.linkedin.com/in/devesh-bhaskaran/) and [Abhiram Gopal Dasika](https://www.linkedin.com/in/alfadelta10010/) where I was introduced to the world of **Automotive SoC Design**. I decided I wanted to build something that felt **real**: where the CPU actually boots a program, where peripherals respond to memory-mapped I/O, and where every instruction running in software maps to a transaction on a bus.

"Aetheron" was born out of that drive.

It started with just a CPU core, then quickly spiraled into a full-on SoC: with ROM, RAM, [UART](https://en.wikipedia.org/wiki/Universal_asynchronous_receiver-transmitter), and a [TileLink](https://starfivetech.com/uploads/tilelink_spec_1.8.1.pdf) fabric to tie everything together. I didn’t want to reuse cores or plug in pre-built peripherals. This had to be something I understood fully — every wire, every rule, every hex file in the ROM image.

> Curious to know what exactly is a SoC? Click [here](https://prawns.dev/blogs/what-is-a-soc/) to read my blog about Introduction to SoCs.

---

## Setting the Vision

### **What I wanted to build**

From day one, I wasn’t interested in just blinking LEDs or simulating a few instructions. My goal was clear: build a **bootable SoC** that could run real software — not a demo, not hardcoded testbenches, but actual compiled C programs.

I wanted:

- A pipelined **RISC-V CPU** (RV32I) I could understand and modify.
    
- **ROM** and **RAM** memory regions with clear separation.
    
- A **TileLink** interconnect, for clean and modular communication.
    
- Memory-mapped peripherals like **UART**, **GPIO**, and **Timer**.
    
- A boot process where the CPU fetched code from ROM, copied payloads into RAM, and executed them like a real embedded system.
    

In short: something you could imagine dropping into a real chip, even if it never left simulation.

---

## Early decisions I made

One of the first choices was the instruction set. I went with **RISC-V** because it's clean, open, and designed to be simple — perfect for a project like this. It made writing my CPU pipeline much more enjoyable and gave me a standard to work against.

For the HDL, I chose **Bluespec SystemVerilog (BSV)**. I already had experience with Verilog, but Bluespec’s rule-based semantics and powerful types made building a modular system much easier. Once you wrap your head around guarded atomic actions, you realize how expressive it is — especially for designing protocols like TileLink.

I also went with **TileLink** as the on-chip interconnect protocol instead of something like [AMBA](https://developer.arm.com/documentation/102202/0300/What-is-AMBA--and-why-use-it-). TileLink’s open, light weight and fully-specified nature made it easier to reason about formally. Its decoupled, pipelined `a`/`d` channel design fit naturally into the rule-based model of BSV, and it scaled well as I added more peripherals.

Finally, I decided early on that **simulation-only was totally fine**. I wasn’t aiming to synthesize this on an FPGA. I just wanted correctness, modularity, and the ability to run and debug C code end to end. That freedom let me move faster and focus on the design, not timing closure or board quirks.

---

## The First Steps

### **Designing the building blocks**

I began with the bare minimum: a **CPU**, **ROM**, **RAM**, and **UART** — all stitched together through a custom **TileLink interconnect**. At this point, the SoC didn’t boot any real programs. It wasn’t even executing C yet. But my focus was on getting the **pipeline running** in order to see actual instructions being fetched, decoded, and executed.

The **CPU design started as a stub** — a placeholder module that just returned hardcoded values. It helped me bring up the rest of the system without worrying about instruction execution yet. Once the rest of the SoC took shape, I **replaced the stub with a proper 5-stage pipelined core** called [**Specula**](https://github.com/pranav0x0112/Specula). At the time, Specula was a relatively simple in-order RISC-V core. It would eventually evolve into something far more ambitious: a true **Out-of-Order** processor. But for now, it was my way of getting real programs flowing through an instruction pipeline.

The **ROM** was modeled as a read-only memory block, used to hold the bootloader and payload at simulation time. The **RAM** was a simple byte-addressable memory model, accessible via TileLink. And the **UART**, while basic, was my only way to get output from inside the SoC — my single window into what the CPU was doing.

![full_rom_to_ram_boot.png](https://github.com/pranav0x0112/Aetheron/blob/main/misc/full_rom_to_ram_boot.png?raw=true)

> The full ROM → RAM boot process in Aetheron

### **Testing with assembly**

At this stage, I was manually writing tiny **RISC-V assembly test programs**, compiling them into `.text` and `.data` sections, converting them into hex files, and loading them into ROM. No C yet — just handcrafted instructions to test branching, memory stores, and UART writes.

This was also when I first got UART output working in my assembly code.

![uart_success.png](https://github.com/pranav0x0112/Aetheron/blob/main/misc/uart_success.png?raw=true)

> And just like that the CPU could _talk_ :D

---

## Roadblocks & Debugging Era

> As with all systems design, just when things seemed stable — everything broke.

Up to this point, I had a functioning ROM, RAM, UART, and a pipelined CPU. My bootloader, written in RISC-V assembly, was executing correctly, and I could print characters over UART using simple `sw` instructions. Things felt solid. It was time to try running a C program.

That’s when it all began to crumble.

### 1. The Case of the Silent UART

I compiled a tiny C program, linked it with my custom script, and embedded the binary into ROM. But when I ran the simulation… nothing. No UART output. Just silence.

I suspected a mapping issue. Was my C code writing to the wrong MMIO address? But `UART_ADDRESS = 0x40001000` matched in both hardware and software. Everything checked out — yet nothing was printing.

I turned to trace logs. I dumped every memory access, register write, UART state change. That’s when I noticed: the CPU wasn't even reaching `printf()`. It was looping somewhere much earlier.

### 2. Memory Mapping & Peripheral Routing

Maybe the hardware was at fault? I added debug prints in the TileLink interconnect and peripherals. I confirmed: writes to `0x40001000` _were_ routed correctly to the UART. Address decoding wasn’t the issue.

![Aetheron-Memory-Map](https://github.com/pranav0x0112/Aetheron/raw/main/misc/memory-map.png)

### 3. Toolchain & Linker Script Confusion

The Makefile, linker scripts, and `objcopy` pipeline were fragile. I reviewed every line: memory regions, section assignments, symbol names. Using `readelf`, `objdump`, and `objcopy`, I inspected each ELF and binary output. Slowly, I rebuilt a correct linker script that mapped ROM and RAM properly.

But still — the program didn’t run.

### 4. The Payload That Never Was

Finally, I suspected a deeper issue — not the code itself, but how it was getting into ROM.

See, my bootloader was supposed to copy a `.payload` section from ROM to RAM, then jump to it. But what if that section wasn’t even being included in the final ROM image?

I checked the ELF file using `riscv64-elf-objdump -h` and saw something weird: the `.payload` section was listed, but with `VMA = 0x0` and zero file offset. It looked like the section existed… but wasn’t actually backed by any data in the binary.

The culprit was `objcopy`. My Makefile used:

```bash
riscv64-elf-objcopy -O binary -j .payload ...
```

But that doesn’t extract the section properly if the linker never placed it right in the first place.

At one point, my linker script had something _like_:

```plaintext
.payload : { *(.text .text.* .rodata .data .bss) }
```

But that only works if the incoming `.o` file explicitly labels those sections as part of `.payload`. In my case, it didn’t. The payload data existed under normal sections (`.text`, `.rodata`, etc.), but nothing instructed the linker to collect them under `.payload`.

I rewrote the linker script to explicitly place the payload contents, added the `.payload` symbol in the source to force section labeling, and rechecked everything with `objdump`. This time the section showed up with the right address and size. The resulting `.bin` was properly populated.

I regenerated `rom.hex`, ran the simulation… and there it was. My `rom.hex` finally contained a working payload, and Aetheron executed its first C program.

---

## Key Learnings

Looking back, building Aetheron taught me far more than just how to wire up peripherals or write linker scripts.

- **Hardware/software co-design is real.** Designing the SoC and writing code for it in tandem helped me see how tightly coupled these layers are. Every software bug was a chance to inspect my hardware — and vice versa.
    
- **Debugging is a full-stack art.** From the ROM image to C code to UART signals, every layer matters. Sometimes the problem isn’t the code — it’s how your tools handle it.
    
- **Don’t underestimate simulation.** I didn't need an FPGA or fancy board. Just a solid simulation setup, trace dumps, and a good mental model were enough to build and boot real programs.
    

Most importantly, I learned to enjoy the grind — to sit with a problem, question every assumption, and slowly trace my way to a solution.

> Interested to read about my SoC Learnings? [Click here](https://github.com/pranav0x0112/prawns-stack/tree/main/SoC_learnings) :D, I try to keep it up-to-date.

---

## What’s Next

Aetheron is far from finished. There’s still a lot more I want to explore and build on top of it. One of the first goals is adding interrupt support, so peripherals like the Timer can trigger software events.

And then there's a fun suggestion from one of my seniors [Joyen Benitto](https://www.linkedin.com/in/joyenbenitto/) where he mentioned I should try building a custom accelerator that sits on an AHB TileLink slave port. Maybe a memory-mapped matrix multiplier: write your operands to an address, and read back the result. That idea stuck with me. Now that the TileLink fabric and basic SoC infrastructure are in place, Aetheron feels like the perfect playground to try something like that.

---

## Final Thoughts

Aetheron was more than just a successful project as it reflects how I think, the systems I dream of, and the way I approach problems. It’s a culmination of goals, ideas, mistakes, and long nights chasing one more bug.

I hope it also serves as a spark for others to build their own systems, question abstractions, and enjoy the messy, brilliant process of bringing hardware to life!