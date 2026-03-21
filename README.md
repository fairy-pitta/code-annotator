# Code Annotator

**Create beautiful, annotated code snippets for documentation, presentations, and teaching — entirely in the browser.**

<!-- Add your screenshot: save as docs/screenshot.png -->
![Code Annotator Screenshot](./docs/screenshot.png)

## ✨ Features

- **Syntax Highlighting** — Paste code with syntax highlighting for 19 languages via Prism.js
- **Text Selection Annotations** — Select any text in your code to create annotation cards
- **Rich Text Editing** — Format annotations with bold, italic, underline, strikethrough, and lists
- **Customizable Styling** — Set highlight color, text color, and font size per annotation
- **Drag & Drop** — Freely position annotation cards and arrows on the canvas
- **Resizable Elements** — Resize the code block, annotation cards, and export area to fit your needs
- **Dark / Light Theme** — Toggle between themes to match your preference
- **PNG Export** — Export your annotated code as a PNG image with a live preview modal
- **Privacy First** — Runs entirely in the browser; no data ever leaves your machine

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later recommended)

### Installation

```bash
git clone https://github.com/fairy-pitta/code-annotator.git
cd code-annotator
npm install
```

### Development

```bash
npm run dev
```

The app will be available at [http://localhost:8788](http://localhost:8788).

### Deploy

```bash
npm run deploy
```

Deploys to Cloudflare Workers.

## 📖 Usage

1. **Paste** your code into the editor and select the language.
2. **Select** a portion of text to create an annotation.
3. **Annotate** by writing your notes in the rich-text card that appears.
4. **Customize** highlight colors, text colors, font sizes, and reposition cards and arrows as needed.
5. **Export** the result as a PNG image.

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JavaScript |
| Syntax Highlighting | [Prism.js](https://prismjs.com/) |
| Image Export | [html2canvas](https://html2canvas.hertzen.com/) |
| Hosting | [Cloudflare Workers](https://workers.cloudflare.com/) |

## 🔒 Privacy

Code Annotator is a **frontend-only** application. All processing happens in your browser — no code, annotations, or images are sent to any server.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
