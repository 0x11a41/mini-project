function circleButton({ iconName, onClick }) {
    const micBtn = document.createElement('div');
    micBtn.classList.add('btn-circle', iconName, 'highlight-on-cursor');
    micBtn.onclick = onClick;
    return micBtn;
}
export { circleButton };
