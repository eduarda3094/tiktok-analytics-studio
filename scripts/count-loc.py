#!/usr/bin/env python3
"""Count lines of code in the project, broken down by type."""
import os
import sys
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path("/home/z/my-project")

# Extensions to count
EXTENSIONS = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript React",
    ".js": "JavaScript",
    ".jsx": "JavaScript React",
    ".py": "Python",
    ".css": "CSS",
    ".prisma": "Prisma Schema",
    ".json": "JSON (configs)",
    ".md": "Markdown (docs)",
    ".sh": "Shell scripts",
    ".mjs": "ES Modules JS",
}

# Directories to ignore
IGNORE_DIRS = {
    "node_modules", ".next", ".git", "out", "build", "dist",
    "skills", "tool-results", ".zscripts", "storage", "db",
    ".cache", ".turbo", ".prisma", "examples", "tmp",
}

# Specific files to ignore
IGNORE_FILES = {
    "bun.lock", "package-lock.json", "yarn.lock",
    "dev.log", "server.log",
}

def should_ignore(path: Path) -> bool:
    """Check if a file should be ignored."""
    if path.name in IGNORE_FILES:
        return True
    # Ignore .backup files
    if ".backup-" in path.name:
        return True
    # Ignore .db files
    if path.suffix == ".db":
        return True
    return False

def count_file(path: Path) -> tuple[int, int]:
    """Count total lines and non-empty lines in a file."""
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        lines = content.split("\n")
        total = len(lines)
        non_empty = sum(1 for l in lines if l.strip())
        return total, non_empty
    except Exception:
        return 0, 0

def main():
    by_lang = defaultdict(lambda: {"files": 0, "total": 0, "non_empty": 0})
    by_dir = defaultdict(lambda: {"files": 0, "total": 0, "non_empty": 0})
    all_files = []

    for root, dirs, files in os.walk(PROJECT_ROOT):
        # Filter ignored dirs in-place
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for fname in files:
            path = Path(root) / fname
            if should_ignore(path):
                continue

            ext = path.suffix.lower()
            if ext not in EXTENSIONS:
                continue

            lang = EXTENSIONS[ext]
            total, non_empty = count_file(path)

            by_lang[lang]["files"] += 1
            by_lang[lang]["total"] += total
            by_lang[lang]["non_empty"] += non_empty

            # Group by top-level dir
            try:
                rel = path.relative_to(PROJECT_ROOT)
                top = str(rel.parts[0]) if rel.parts else "."
                by_dir[top]["files"] += 1
                by_dir[top]["total"] += total
                by_dir[top]["non_empty"] += non_empty
            except ValueError:
                pass

            all_files.append((str(path.relative_to(PROJECT_ROOT)), lang, total, non_empty))

    # Print by language
    print("=" * 70)
    print("LINHAS DE CÓDIGO POR LINGUAGEM")
    print("=" * 70)
    print(f"{'Linguagem':<25} {'Arquivos':>10} {'Linhas':>10} {'Não vazias':>12}")
    print("-" * 70)

    total_files = 0
    total_lines = 0
    total_non_empty = 0

    for lang, counts in sorted(by_lang.items(), key=lambda x: -x[1]["total"]):
        print(f"{lang:<25} {counts['files']:>10} {counts['total']:>10} {counts['non_empty']:>12}")
        total_files += counts["files"]
        total_lines += counts["total"]
        total_non_empty += counts["non_empty"]

    print("-" * 70)
    print(f"{'TOTAL':<25} {total_files:>10} {total_lines:>10} {total_non_empty:>12}")

    # Print by directory
    print()
    print("=" * 70)
    print("LINHAS POR DIRETÓRIO TOP-LEVEL")
    print("=" * 70)
    print(f"{'Diretório':<25} {'Arquivos':>10} {'Linhas':>10} {'Não vazias':>12}")
    print("-" * 70)

    for dir_name, counts in sorted(by_dir.items(), key=lambda x: -x[1]["total"]):
        print(f"{dir_name:<25} {counts['files']:>10} {counts['total']:>10} {counts['non_empty']:>12}")

    # Code only (TS + TSX + JS + PY + CSS + PRISMA) — excluding JSON/MD/SH configs
    code_langs = {"TypeScript", "TypeScript React", "JavaScript", "JavaScript React",
                  "Python", "CSS", "Prisma Schema", "ES Modules JS"}
    code_total = sum(c["total"] for lang, c in by_lang.items() if lang in code_langs)
    code_non_empty = sum(c["non_empty"] for lang, c in by_lang.items() if lang in code_langs)
    code_files = sum(c["files"] for lang, c in by_lang.items() if lang in code_langs)

    print()
    print("=" * 70)
    print("RESUMO")
    print("=" * 70)
    print(f"Arquivos de código (TS/TSX/JS/PY/CSS/Prisma): {code_files}")
    print(f"Linhas totais de código:                      {code_total}")
    print(f"Linhas não vazias de código:                  {code_non_empty}")
    print()
    print(f"Arquivos de config/docs (JSON/MD/SH):         {total_files - code_files}")
    print(f"Linhas de config/docs:                        {total_lines - code_total}")
    print()
    print(f"TOTAL GERAL (tudo):                           {total_lines} linhas em {total_files} arquivos")

    # Top 15 largest files
    print()
    print("=" * 70)
    print("TOP 15 ARQUIVOS MAIORES (por linhas)")
    print("=" * 70)
    for path, lang, total, non_empty in sorted(all_files, key=lambda x: -x[2])[:15]:
        print(f"  {total:>5} linhas  {lang:<20}  {path}")

if __name__ == "__main__":
    main()
