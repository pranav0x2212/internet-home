---
title: "When Microcontrollers Struggle with Math: Building Herald"
date: "2026-03-29"
tags: [hardware, VLSI, DSP, Tiny Tapeout, open-source-silicon, embedded]
description: "A deep dive into building Herald, a fixed-point DSP coprocessor for Tiny Tapeout, from architecture and CORDIC design to GDS layout and silicon."
permalink: posts/{{ title | slug }}/index.html
author_name: M Pranav
author_link: "https://github.com/pranav0x0112"
customFields:
  - image: "/assets/images/tiny-tone.png"
---

## Why I Built Herald

Microcontrollers are great, until you ask them to do math. 

Try throwing trigonometry or signal processing at a small MCU and things slow down very quickly. This is especially true for cheaper or simpler chips that either do not have a floating point unit or rely on relatively expensive hardware support. Even when FPUs are available, they are not always the best choice for power or area constrained systems. 

I wanted something simpler. Maybe a small hardware block that could handle these operations efficiently without dragging in all the overhead of floating point. And that idea eventually became [Herald](https://github.com/pranav0x0112/Herald), a fixed-point DSP coprocessor designed for [Tiny Tapeout](https://tinytapeout.com/). 

The design itself was written in [Bluespec SystemVerilog](https://github.com/rsnikhil/Bluespec_BSV_Tutorial) for rapid prototyping, and then compiled down to Verilog to fit into the Tiny Tapeout flow.

At first, this was just an experiment to see if something like this could even fit within Tiny Tapeout's constraints. It turned out to be a lot more involved than expected. 

---

## What Herald does

At a high level, Herald is a small hardware accelerator for math operations that tend to be slow on Microcontrollers. 

It focuses on two main categories:
- Trigonometric and vector operations
- Multiply-accumulate (MAC) operations

That already covers a lot of real-world use cases like filtering, sensor fusion, and basic control systems. Instead of doing all this in software, the idea is simple. You send inputs to Herald, let it compute in hardware and the result is read back once its ready.

Internally, this is handled by two main blocks: 
- A [CORDIC](https://www.allaboutcircuits.com/technical-articles/an-introduction-to-the-cordic-algorithm/) engine for trigonometry and vector math
- A [MAC](https://en.wikipedia.org/wiki/Multiply%E2%80%93accumulate_operation) unit for fast arithmetic accumulation

A small control interface ties everything together and keeps the interaction simple.

---

## Architecture Overview

At a high level, Herald can be split into two parts: a control path and a data path. 

The control path is driven by a small FSM. It handles commands, collects input data, and decides when to start computation and when results are ready. 

The datapath is where the actual work happens. Inputs are routed to the appropriate compute block, and the result is selected and sent back through the interface. 

Keeping these two blocks seperate made the design easier to reason about, especially during debugging!

![Block_Diagram](/assets/images/herald_block_diagram.png)

> High-level architecture of Herald showing the control FSM, compute engines, and result path.

---

## How Herald really works

For the low level nerds, this is where things get a bit more interesting.

So Herald operates through a simple command driven flow controlled by a FSM. Each operation follows a fixed sequence: 

- A command is written to select the operation
- Input data is sent byte by byte
- The selected compute block is triggered
- The result becomes available once computation completes!

Since each operand is 24 bits wide, data is transferred over multiple cycles using an 8-bit interface. The FSM takes care of assembling these bytes and ensuring everything is aligned before execution starts. 

From the outside, this just looks like a small protocol. Internally though, it keeps the design predictable and, more importantly, saved me from pulling my hair out by avoiding a bunch of timing headaches.

![FSM](/assets/images/fsm.png)

> FSM controlling command intake, operand loading, execution and result output. 

---

## The Interesting Bits

A lot of the design choices in Herald come down to one idea: keep things simple, but still useful. 

### Fixed-point arithmetic

Instead of using floating point, Herald uses a fixed-point format (Q12.12). In simple terms, everything is stored as an integer with an implicit scaling factor. 

So instead of working with something like `3.5`, you scale it and store it as an integer. All computations then stay in integer form. This avoids the need for FPU entirely, which saves both area and complexity, while still giving enough precision for most embedded use cases. 

### CORDIC: doing trig without "real" math

![CORDIC](/assets/images/cordic.gif)

> CORDIC can be visualized as rotating a vector toward a target angle. In hardware, this happens iteratively in small steps.

The CORDIC engine is probably the most interesting part of the design. 

Instead of directly computing things like `sin` or `cos`, it works by rotating a vector in small steps until it reaches the desire angle. Each step only uses shifts and additions, which makes it very hardware friendly. 

After enough iterations, you end up with a very close approximation of the result without ever using multipliers or complex functions. 

### MAC: simple, but useful

The MAC Unit is much simpler, but it ends up being just as useful. 

It maintains an internal accumulator and supports operations like multiply, accumulate and subtract. This makes it ideal for things like dot product or filtering, where values are combined repeatedly. 

It is also much faster than the CORDIC path, completing in a single cycle in this design, which makes it a nice complement to the more iterative CORDIC engine. 

---

## From Code to Silicon

### The Big Leagues

![Full GDS](/assets/images/full_gds.png)

> Full Tiny Tapeout IHP26A shuttle layout showing multiple user designs sharing the same space!

One of the most satisfying parts of this project was seeing the design turn into actual layout. 

At the shuttle level, Herald is just one small block among many designs sharing the same space. It is easy to forget how small your design really is until you see it in that context. 

### Zooming into Herald

![Herald_GDS](/assets/images/herald_gds.png)

> Herald's layout showing standard cells and routing after synthesis and place-and-route. 

Grabbing a magnifying glass and looking into the shuttle GDS, we can have a closer look at Herald! This is where things get more interesting. 

What started as HDL modules and state machines is now a dense grid of standard cells and routing. Every operation (from simple addition to a full CORDIC iteration) is physically represented here in the most fundamental electronic device: the transistor. 

---

## What Went Wrong (And What I Learned)

![Bugs](/assets/images/bugs.png)

> As is always the case, no hardware project is complete without a few things going wrong, and Herald definitely had its share. 

### The "it works...wait, no it doesn't" bug

At one point, the CORDIC engine was producing completely incorrect results. Everything looked fine on paper, but the outputs were clearly off. 

After digging into it, the issue turned out to be a subtle timing problem. The design was effectively reading results before the computation had actually progressed, so it ended up returning values from an earlier iteration. 

The fix itself was small, just an extra control signal to make sure the computation had actually started, but figuring it out took a lot longer than expected.

### When data is not what you think it is

Another issue introduced itself while testing the wrapper interface. Values coming out the design were correct, but somehow ended up in the wrong places. 

This turned out to be due to how tuples are packed in Bluespec SystemVerilog. The ordering was not what I initially assumed, which meant values were being interpreted incorrectly when read out. 

### Looks right...until you check it

One interesting moment was verifying the CORDIC gain factor. 

Instead of just trusting the theoretical value, I compared expected results with actual hardware outputs. This helped confirm that the implementation was behaving as intended, even with approximation errors from finite iterations. 

It is very easy to assume things are correct when they "look right", but actually checking the numbers made a big difference!

---

## Wrapping Up

What started as a small experiment turned into a full journey through designing, debugging and finally seeing the project make its way to actual silicon! 

Working within the constraints of Tiny Tapeout forced a lot of decisions, from using fixed-point arithmetic to keeping the interface simple. In the end, those constraints shaped the design just as much as the original idea. 

More than anything, this project is a good proof which shows that the real challenges in hardware are not always the big ideas, but even the small details. Timing and integration tend to matter far more than expected.

I am truly grateful to the Tiny Tapeout community for their quick help whenever I needed it. I am very much excited to see how Herald behaves in real silicon soon :)