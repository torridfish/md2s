---
marp: true
headingDivider: 2
---

# Include Deck

## Part
### The deck's own slide

text of its own

```include
include-part.md
```

### Highlighted code

```python {hl=2,4-5}
def f():
    a = 1
    b = 2
    c = 3
    d = 4
```

### A diff

```diff
- removed line
+ added line
  kept line
```

### A missing file

```include
include-absent.md
```

### An example stays text

````markdown
```include
never-expanded.md
```
````
