{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    python3
    python3Packages.uvicorn
    python3Packages.fastapi
    python3Packages.websockets
    python3Packages.livereload
    python3Packages.httpx
    python3Packages.zeroconf
    python3Packages.pydantic
    python3Packages.qrcode
    python3Packages.pillow
    ty
    ruff
    vscode-css-languageserver
    superhtml
    vscode-json-languageserver
    typescript-language-server
    websocat # to test websocket endpoints 
    typescript
  ];

  shellHook = ''
    echo "Entered dev-shell"
    echo "run \`make\` to run both runner.py and tsc -w"
  '';
}
