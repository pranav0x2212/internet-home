# prawns.dev

My personal website, built with [anna](https://github.com/anna-ssg/anna).

## Adding something

- Blog post: add a Markdown file in `site/content/blogs/`.
- TIL note: add a Markdown file in `site/content/til/`.
- Photo: drop it in `site/public/images/` and add a line for it in `site/content/gallery/index.md`.

Copy the front matter (the block at the top between `---`) from an existing post, then preview with:

```sh
anna -s
```
