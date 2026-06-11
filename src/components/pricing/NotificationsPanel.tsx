import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type Notification } from "@/store/notifications";
import { cn } from "@/lib/utils";
import { Bell, AlertTriangle, Calendar, AlertCircle, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

const TYPE_ICON: Record<Notification["type"], { Icon: typeof Bell; tone: string }> = {
  alert: { Icon: AlertTriangle, tone: "text-warning" },
  activity_due: { Icon: Calendar, tone: "text-primary" },
  activity_overdue: { Icon: AlertCircle, tone: "text-destructive" },
  system: { Icon: Info, tone: "text-muted-foreground" },
};

export function NotificationsPanel({ children }: Props) {
  const [open, setOpen] = useState(false);
  const notifications = useNotifications((s) => s.notifications);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-medium">Notificações</h3>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllRead()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Marcar todas como lidas
            </button>
          )}
        </header>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-muted-foreground">
            <Bell className="h-6 w-6 opacity-60" />
            <p className="text-xs">Nenhuma notificação no momento</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <ul className="divide-y divide-border/40">
              {notifications.map((n) => {
                const { Icon, tone } = TYPE_ICON[n.type];
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        markRead(n.id);
                        if (n.href) navigate(n.href);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                        !n.read && "bg-primary/5",
                      )}
                    >
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight">{n.title}</p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(n.createdAt), { locale: ptBR, addSuffix: true })}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
