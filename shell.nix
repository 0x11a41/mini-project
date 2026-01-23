{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    python3
    python3Packages.uvicorn
    python3Packages.fastapi
    python3Packages.websockets
    python3Packages.zeroconf
    python3Packages.python-lsp-server
    ty
    ruff
    vscode-css-languageserver
    superhtml
    vscode-json-languageserver
    typescript-language-server
    live-server
  ];
  shellHook = ''
  echo "entered dev-shell: $(python --version)"
  '';
}
