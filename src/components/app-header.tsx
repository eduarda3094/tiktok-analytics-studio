"use client";

import { Moon, Sun, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AppHeader({ nimAvailable }: { nimAvailable: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 via-fuchsia-500 to-cyan-400 shadow-lg shadow-fuchsia-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <h1 className="text-base font-bold tracking-tight sm:text-lg">
              TikTok Analytics Studio
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Powered by NVIDIA NIM · OCR + Whisper + Banco completo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={nimAvailable ? "default" : "secondary"}
            className={
              nimAvailable
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }
          >
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
            NIM {nimAvailable ? "online" : "sem API key"}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Alternar tema"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </div>
      </div>
    </header>
  );
}
