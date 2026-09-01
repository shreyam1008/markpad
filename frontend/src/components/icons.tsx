import {
  ArrowLeft as ArrowLeftNode,
  Bold as BoldNode,
  ChevronDown as ChevronDownNode,
  ChevronRight as ChevronRightNode,
  Clock3 as Clock3Node,
  Code2 as Code2Node,
  Columns2 as Columns2Node,
  Copy as CopyNode,
  Eye as EyeNode,
  Ellipsis as EllipsisNode,
  Files as FilesNode,
  FileText as FileTextNode,
  FolderOpen as FolderOpenNode,
  FilePlus2 as FilePlus2Node,
  Image as ImageNode,
  Info as InfoNode,
  Italic as ItalicNode,
  Link as LinkNode,
  List as ListNode,
  ListOrdered as ListOrderedNode,
  ListTodo as ListTodoNode,
  Minus as MinusNode,
  PanelLeftClose as PanelLeftCloseNode,
  PanelLeftOpen as PanelLeftOpenNode,
  Pencil as PencilNode,
  Plus as PlusNode,
  Quote as QuoteNode,
  RefreshCw as RefreshCwNode,
  Redo2 as Redo2Node,
  Save as SaveNode,
  Search as SearchNode,
  Settings as SettingsNode,
  SquarePen as SquarePenNode,
  Star as StarNode,
  Strikethrough as StrikethroughNode,
  Square as SquareNode,
  Table2 as Table2Node,
  TriangleAlert as TriangleAlertNode,
  Trash2 as Trash2Node,
  Undo2 as Undo2Node,
  X as XNode,
  type IconNode,
} from "lucide";
import { createElement, forwardRef, type SVGProps } from "react";

function icon(nodes: IconNode) {
  return forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(function MarkpadIcon(
    { className, children, ...props },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
        {...props}
      >
        {nodes.map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index }))}
        {children}
      </svg>
    );
  });
}

export const Bold = icon(BoldNode);
export const ArrowLeft = icon(ArrowLeftNode);
export const ChevronDown = icon(ChevronDownNode);
export const ChevronRight = icon(ChevronRightNode);
export const Clock3 = icon(Clock3Node);
export const Code2 = icon(Code2Node);
export const Columns2 = icon(Columns2Node);
export const Copy = icon(CopyNode);
export const Eye = icon(EyeNode);
export const Ellipsis = icon(EllipsisNode);
export const Files = icon(FilesNode);
export const FileText = icon(FileTextNode);
export const FilePlus2 = icon(FilePlus2Node);
export const FolderOpen = icon(FolderOpenNode);
export const ImageIcon = icon(ImageNode);
export const Info = icon(InfoNode);
export const Italic = icon(ItalicNode);
export const Link = icon(LinkNode);
export const List = icon(ListNode);
export const ListOrdered = icon(ListOrderedNode);
export const ListTodo = icon(ListTodoNode);
export const Minus = icon(MinusNode);
export const PanelLeftClose = icon(PanelLeftCloseNode);
export const PanelLeftOpen = icon(PanelLeftOpenNode);
export const Pencil = icon(PencilNode);
export const Plus = icon(PlusNode);
export const Quote = icon(QuoteNode);
export const RefreshCw = icon(RefreshCwNode);
export const Redo2 = icon(Redo2Node);
export const Save = icon(SaveNode);
export const Search = icon(SearchNode);
export const Settings = icon(SettingsNode);
export const SquarePen = icon(SquarePenNode);
export const Star = icon(StarNode);
export const Strikethrough = icon(StrikethroughNode);
export const Table2 = icon(Table2Node);
export const AlertTriangle = icon(TriangleAlertNode);
export const Trash2 = icon(Trash2Node);
export const Undo2 = icon(Undo2Node);
export const X = icon(XNode);
export const WindowClose = icon(XNode);
export const WindowMaximize = icon(SquareNode);
export const WindowMinimize = icon(MinusNode);
export const WindowRestore = icon(CopyNode);
