function button({ label, classes = [], onClick }) {
    const btn = document.createElement('button');
    btn.innerText = label;
    btn.classList.add('highlight-on-cursor', ...classes);
    btn.onclick = () => onClick();
    return btn;
}
export { button };
