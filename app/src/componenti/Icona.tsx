import {
  Archive, ArrowDown, ArrowDownLeft, ArrowLeftRight, ArrowUp, ArrowUpRight, Banknote, Bed, Briefcase, Bus, Calculator, Calendar, CalendarCheck, CalendarClock,
  CalendarRange, Camera, Car, Cat, ChartColumn, ChartLine, ChartPie, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Coffee,
  CreditCard, Ellipsis, Eye, EyeOff, Factory, FileText, Fuel, Gamepad2, Gift, Glasses, Globe, Heart, House, Info, KeyRound, Landmark, Laptop, Layers,
  LayoutDashboard, ListChecks, Lock, LogOut, type LucideIcon, Mail, Music, Package, Pencil, Percent, PiggyBank, Pill, Plane, Plus, Refrigerator, Repeat,
  Scale, Search, Shield, ShieldCheck, Shirt, ShoppingCart, SlidersHorizontal, Smartphone, Sofa, SquareParking, Stethoscope, Tags, Target, Ticket, Trash2,
  TreePalm, TrendingUp, Tv, User, UserPlus, Users, Utensils, Wallet, Wrench, X, Zap,
} from 'lucide-react-native';
import type { NomeColore } from '../tema/token.ts';
import { useTema } from '../tema/tema.tsx';

// CMP-01 Icona: le icone Lucide della libreria, misure 16 · 20 · 24, colore da token.
// Il nome è quello di Lucide (es. "house", "shopping-cart"), lo stesso salvato
// nelle categorie del database. Solo queste icone finiscono nel pacchetto.

export type Misura = 16 | 20 | 24;

const ICONE: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, 'calendar-check': CalendarCheck, target: Target, 'arrow-left-right': ArrowLeftRight, wallet: Wallet,
  'chart-line': ChartLine, 'chart-pie': ChartPie, tags: Tags, user: User, 'log-out': LogOut, plus: Plus, pencil: Pencil, x: X,
  'chevron-down': ChevronDown, 'chevron-up': ChevronUp, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, search: Search, archive: Archive, eye: Eye, 'eye-off': EyeOff,
  mail: Mail, lock: Lock, 'key-round': KeyRound, 'user-plus': UserPlus, users: Users, info: Info, 'circle-check': CircleCheck, 'circle-x': CircleX,
  'circle-alert': CircleAlert, 'sliders-horizontal': SlidersHorizontal, calculator: Calculator, 'chart-column': ChartColumn, 'list-checks': ListChecks,
  'calendar-clock': CalendarClock, 'calendar-range': CalendarRange, calendar: Calendar, scale: Scale, 'trending-up': TrendingUp,
  'arrow-down-left': ArrowDownLeft, 'arrow-up-right': ArrowUpRight, 'arrow-down': ArrowDown, 'arrow-up': ArrowUp, percent: Percent, layers: Layers,
  globe: Globe, factory: Factory, landmark: Landmark, banknote: Banknote, 'credit-card': CreditCard, 'piggy-bank': PiggyBank, ellipsis: Ellipsis,
  smartphone: Smartphone, house: House, zap: Zap, 'trash-2': Trash2, sofa: Sofa, utensils: Utensils, 'shopping-cart': ShoppingCart, coffee: Coffee,
  car: Car, fuel: Fuel, 'square-parking': SquareParking, shield: Shield, 'file-text': FileText, wrench: Wrench, bus: Bus, repeat: Repeat, tv: Tv,
  music: Music, laptop: Laptop, ticket: Ticket, 'tree-palm': TreePalm, 'gamepad-2': Gamepad2, heart: Heart, pill: Pill, stethoscope: Stethoscope,
  glasses: Glasses, package: Package, shirt: Shirt, gift: Gift, cat: Cat, briefcase: Briefcase, camera: Camera, plane: Plane, bed: Bed,
  refrigerator: Refrigerator, 'shield-check': ShieldCheck, check: Check,
};

export function Icona({ nome, misura = 20, colore = 'icona-predefinita' }: { nome: string; misura?: Misura; colore?: NomeColore }) {
  const { c } = useTema();
  const Disegno = ICONE[nome] ?? Ellipsis;
  return <Disegno size={misura} color={c[colore]} strokeWidth={2} aria-hidden />;
}
