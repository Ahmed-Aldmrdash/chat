import {
  BroadcastIcon,
  ChartIcon,
  EyeIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/Icons";

/** روابط لوحة التحكم — بتظهر فوق قايمة المحادثات في /admin */
export const ADMIN_NAV = [
  {
    href: "/admin/users",
    label: "المستخدمين",
    icon: <UsersIcon width={14} height={14} />,
  },
  {
    href: "/admin/permissions",
    label: "الصلاحيات",
    icon: <ShieldIcon width={14} height={14} />,
  },
  {
    href: "/admin/monitor",
    label: "المتابعة",
    icon: <EyeIcon width={14} height={14} />,
  },
  {
    href: "/admin/broadcast",
    label: "رسالة جماعية",
    icon: <BroadcastIcon width={14} height={14} />,
  },
  {
    href: "/admin/analytics",
    label: "الإحصائيات",
    icon: <ChartIcon width={14} height={14} />,
  },
  {
    href: "/admin/settings",
    label: "الإعدادات",
    icon: <ShieldIcon width={14} height={14} />,
  },
];
