---
title: "TIL: Understanding Isn't the Same as Execution"
date: "2026-05-30"
description: "A small reflection on engineering, first principles, and why deep understanding sometimes feels slower than memorization."
collections:
  - til
---

# Understanding Isn't the Same as Execution

A few weeks ago, after my HPC / Computer Architecture exam, I had a bit of an existential crisis. 

Not the _"I don't understand this field"_ kind but more like: 

> I can understand fairly complex systems, so why do I still make frustratingly silly mistakes sometimes?

The exam had actually gone well overall, but I messed up part of a cache question in a way that bothered me more than it probably should have.

The weird part? I understood the larger idea. Cache locality, compiler optimization, cache behavior - all of that clicked to me. But I missed a smaller assumption about memory layout, and the answer quietly collapsed. 

It felt like my understanding and my execution were not perfectly aligned. So I did what I usually do when confused: reach out to a few seniors and friends who have been around this field much longer than I have. 

I asked them a question that had been bothering me: 

> What makes someone genuinely exceptional in engineering?

One reply in particular stayed with me. The idea was surprisingly simple: 

**Many engineers inherit models. A few rebuild them.**

Most of us are given mental models through classes, documentation, mentors/guides or work. We slowly fill in the gaps as needed and keep moving. But some people seem 
to rebuild those models from first principles. 

Instead of just memorizing, let's say, how a cache behaves, they ask: 

> Why is it designed this way?  
> What tradeoff does this solve?  
> What breaks if we remove this assumption?

Instead of learning _that_ something works, they try to understand _why_ it works. That process is slower. 

Memorization wins in the short term. First-principles understanding often feels inefficient, especially in a place like college where deadlines and exams don't care whether your internal model is philosophically satisfying. 

But maybe that is also why some engineers seem capable of reasoning about unfamiliar systems. Their understanding is coherent enough to grow. 

Another reply said something that connected unexpectedly well with my cache mistake: 

> Complex problems are often just collections of small patterns repeated in different contexts. 

It connected well because that was exactly what happened to me. I understood the larger system, but missed one tiny building block. 

The whole thing made me realize something: Maybe getting better at engineering is not just about learning harder things. Maybe it is also about tightening the tiny building blocks your thinking rests on. Understanding and execution are related, but they are not the same thing. 

Still figuring this one out. I want to end this TIL with a wonderful quote my friend mentioned: 

> To err is human, to insist is ... vibe coding 😉

This TIL couldn't have been written without my best half [Essen](https://essenceia.github.io/), [yg](https://hackaday.io/whygee) and [Erstfeld](https://terse.ink/). 