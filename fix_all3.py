import re

with open('src/gpu/solverTypes.ts', 'r') as f:
    core_code = f.read()

replacement = """
  clearChemistry?(): void;
  seedChemistry?(x: number, y: number, radius: number): void;
  stepChemistry?(iters: number, feed?: number, kill?: number): void;
  depositChemistry?(chem: any, amount: number, colour: [number, number, number], threshold?: number): void;
  chem?: any;
}"""
core_code = core_code.replace("\n}", replacement, 1)

with open('src/gpu/solverTypes.ts', 'w') as f:
    f.write(core_code)
