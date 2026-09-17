"use client";

import { BrainCircuitIcon } from "lucide-react";
import Link from "next/link";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@web/components/ui/sidebar";

export function AuthenticatedNavigation() {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <nav aria-label="Primary">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive render={<Link href="/" />}>
                <BrainCircuitIcon />
                <span>Company mind</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </nav>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AuthenticatedMobileHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4 md:hidden">
      <SidebarTrigger />
      <span className="type-label">Company mind</span>
    </header>
  );
}
