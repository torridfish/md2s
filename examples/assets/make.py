# Regenerates the gallery's example figures: uv run --with matplotlib --with numpy --with pillow python make.py
# Exports are at 2x (200 dpi for a 5 in figure), which md2s places at 1:1 (px / 2).
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import animation

plt.rcParams.update({'font.family': 'serif', 'font.serif': ['Times New Roman', 'Liberation Serif', 'DejaVu Serif'],
                     'font.size': 11, 'axes.spines.top': False, 'axes.spines.right': False, 'mathtext.fontset': 'cm'})
C = ['#4fa8e8', '#e39a4e', '#f0857e', '#4caf50']
rng = np.random.default_rng(0)
steps = np.arange(0, 200)

def curve(scale, floor, noise):
    return floor + scale * np.exp(-steps / 45) + rng.normal(0, noise, steps.size).cumsum() * 0.002

# line chart: training curves, also as a vector PDF
fig, ax = plt.subplots(figsize=(5, 3), dpi=200)
for name, c, (s, f) in zip(['SGD', 'Adam', 'Ours'], C, [(2.0, 0.9), (2.2, 0.6), (2.3, 0.4)]):
    ax.plot(steps, curve(s, f, 0.5), color=c, label=name, lw=1.6)
ax.set_xlabel('step (k)'); ax.set_ylabel('validation loss'); ax.legend(frameon=False)
fig.tight_layout(); fig.savefig('curve.png'); fig.savefig('curve.pdf'); plt.close(fig)

# bar chart: accuracy per benchmark
fig, ax = plt.subplots(figsize=(4.4, 3), dpi=200)
w = 0.26
for k, (name, base) in enumerate([('Baseline', 60), ('+ Aug', 64), ('Ours', 69)]):
    ax.bar(np.arange(4) + (k - 1) * w, base + rng.uniform(-4, 6, 4), w, color=C[k], label=name)
ax.set_xticks(range(4), [f'Bench {b}' for b in 'ABCD']); ax.set_ylabel('accuracy (%)'); ax.set_ylim(40, 80)
ax.legend(frameon=False, ncol=3, loc='upper center', bbox_to_anchor=(0.5, 1.12))
fig.tight_layout(); fig.savefig('bars.png'); plt.close(fig)

# scatter: embeddings of three classes
fig, ax = plt.subplots(figsize=(3.6, 3), dpi=200)
for k, m in enumerate([(-3, 1.5), (2.5, 2.5), (0, -2.5)]):
    p = rng.normal(m, 0.8, (60, 2))
    ax.scatter(p[:, 0], p[:, 1], s=10, color=C[k], label=f'class {k}', alpha=.85)
ax.set_xticks([]); ax.set_yticks([]); ax.set_title('t-SNE of the embeddings', fontsize=11)
for side in ('left', 'bottom'): ax.spines[side].set_visible(False)
ax.legend(frameon=False, fontsize=9, loc='lower right')
fig.tight_layout(); fig.savefig('scatter.png'); plt.close(fig)

# GIF: the loss curve being drawn; the first frame is the finished plot, since a PDF shows only that one
ys = curve(2.3, 0.4, 0.5)
fig, ax = plt.subplots(figsize=(4, 2.6), dpi=160)
line, = ax.plot([], [], color=C[3], lw=2)
dot, = ax.plot([], [], 'o', color=C[2])
ax.set_xlim(0, 200); ax.set_ylim(0, 3); ax.set_xlabel('step (k)'); ax.set_ylabel('loss'); fig.tight_layout()

def draw(i):
    line.set_data(steps[:i + 1], ys[:i + 1]); dot.set_data([steps[i]], [ys[i]])
    return line, dot

animation.FuncAnimation(fig, draw, frames=[199] + list(range(0, 200, 5)) + [199], blit=True).save(
    'training.gif', writer=animation.PillowWriter(fps=12))
plt.close(fig)
