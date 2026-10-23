// Re-export curated icons for PromptCanvas
// Single source of truth - add icons here as needed

export {
  // AI / Magic
  Sparkle,
  MagicWand,
  Lightning,
  Robot,
  Brain,
  Cpu,

  // Actions
  Copy,
  Check,
  Plus,
  Minus,
  Trash,
  Pencil,
  ArrowsClockwise,
  ArrowClockwise,
  ArrowCounterClockwise,
  Lock,
  LockOpen,

  // Navigation
  CaretDown,
  CaretRight,
  CaretLeft,
  CaretUp,
  ArrowRight,
  ArrowLeft,
  SidebarSimple,

  // Media / Video
  VideoCamera,
  FilmSlate,
  FilmStrip,
  Camera,
  Play,
  Pause,

  // Time / Performance
  Clock,
  Timer,
  Gauge,
  Speedometer,

  // UI
  Gear,
  SlidersHorizontal,
  Eye,
  EyeSlash,
  X,
  List,
  GridFour,
  Command,

  // Status
  CheckCircle,
  WarningCircle,
  XCircle,
  Info,

  // Content
  FileText,
  TextT,
  Lightbulb,
  Sun,
  Moon,
  Image,

  // Export / Share
  Export,
  Download,
  Share,
  Link,
  ArrowSquareOut,

  // Misc
  DotsThree,
  Question,
  Star,
  Heart,
  Crop,
  FrameCorners,
  Ruler,
  Target,
  Tree,
  Palette,
  SpeakerHigh,
  Circle,
} from "@phosphor-icons/react";

// Lucide compatibility aliases (use Phosphor equivalents)
export {
  WarningCircle as AlertCircle,
  Warning as AlertTriangle,
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  CaretUp as ChevronUp,
  GoogleChromeLogo as Chrome,
  ArrowSquareOut as ExternalLink,
  EyeSlash as EyeOff,
  House as Home,
  Tray as Inbox,
  Key as KeyRound,
  GridFour as LayoutGrid,
  Spinner as Loader2,
  SignIn as LogIn,
  SignOut as LogOut,
  Envelope as Mail,
  ChatCircle as MessageCircle,
  ChatCentered as MessageSquare,
  ArrowsClockwise as RefreshCw,
  ArrowCounterClockwise as RotateCcw,
  FloppyDisk as Save,
  Scan as ScanEye,
  MagnifyingGlass as Search,
  Gear as Settings,
  SlidersHorizontal as Settings2,
  ShieldWarning as ShieldAlert,
  Sparkle as Sparkles,
  Trash as Trash2,
  TrendUp as TrendingUp,
  TextT as Type,
  VideoCamera as Video,
  MagicWand as Wand2,
  WifiHigh as Wifi,
  WifiSlash as WifiOff,
  Lightning as Zap,
  CheckCircle as CheckCircle2,
  Copy as CopyPlus,
  Pencil as Edit,
} from "@phosphor-icons/react";

// Additional application icons
export {
  BookOpen,
  Calendar,
  Coffee,
  Coins,
  CreditCard,
  Folder,
  GraduationCap,
  Highlighter,
  Images,
  MapPin,
  Microphone,
  Package,
  ShieldCheck,
  SkipForward,
  Tag,
  Upload,
  User,
  Users,
} from "@phosphor-icons/react";

export { Stack as Layers } from "@phosphor-icons/react";
export { Package as Box } from "@phosphor-icons/react";

// Types
export type { IconProps, IconWeight } from "@phosphor-icons/react";

// Phosphor's runtime Icon type, re-exported so consumers can type icon
// references without round-tripping through `ComponentType<{className?: string}>`
// (which is incompatible under React 18 + exactOptionalPropertyTypes).
export type { Icon as IconType } from "@phosphor-icons/react";
