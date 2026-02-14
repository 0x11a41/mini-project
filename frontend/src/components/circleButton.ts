interface CircleButtonProps {
  iconName: string;
  onClick: () => void;
}

function circleButton({ iconName, onClick }: CircleButtonProps): HTMLElement {
  const micBtn = document.createElement('div');
  micBtn.classList.add('btn-circle', iconName, 'highlight-on-cursor');
  micBtn.onclick = onClick;
  return micBtn;
}

export { circleButton }
