interface ButtonProps {
  label: string;
  classes?: string[];
  onClick: () => void;
}

function button({ label, classes = [], onClick }: ButtonProps): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.innerText = label;
  btn.classList.add('highlight-on-cursor', ...classes);
  btn.onclick = () => onClick();
  return btn;
}

export { button };
