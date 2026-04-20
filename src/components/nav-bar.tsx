"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Settings,
  PlayCircle,
  FolderOpen,
  GraduationCap,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Benchmark 评分", icon: BarChart3 },
  { href: "/test-sets", label: "测试集", icon: FolderOpen },
  { href: "/benchmarks", label: "Benchmark 管理", icon: PlayCircle },
  { href: "/rl-training", label: "强化训练", icon: GraduationCap },
  { href: "/settings", label: "设置", icon: Settings },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            <span className="text-lg font-bold">Agent Benchmark Runner</span>
          </div>

          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-[#2C3947] text-[#E8EDF2]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
