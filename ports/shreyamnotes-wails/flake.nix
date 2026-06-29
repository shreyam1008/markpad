{
  description = "ShreyamNotes Wails/WebKitGTK development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = nixpkgs.lib.platforms.linux ++ nixpkgs.lib.platforms.darwin;

      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShell = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            go
            nodejs
            pkg-config
            turbo
          ] ++ lib.optionals stdenv.isLinux [
            gtk3
            webkitgtk_4_1
          ];
        }
      );
    };
}
