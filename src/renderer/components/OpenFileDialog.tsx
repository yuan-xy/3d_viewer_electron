import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, Upload } from 'lucide-react'
import { FILE_FORMATS, ALL_ACCEPT, getGroupAccept, type FileGroup } from '@/config/file-formats'
import { cn } from '@/lib/utils'

const GROUP_LABELS: Record<FileGroup, string> = {
  mesh: 'mesh',
  cad: 'cad',
  bim: 'bim',
  point: 'point',
  volume: 'volume',
  animation: 'animation',
  gcode: 'gcode',
  other: 'other',
}

interface OpenFileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFileSelected: (file: File) => void
}

export default function OpenFileDialog({ open, onOpenChange, onFileSelected }: OpenFileDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('openFile.title')}</DialogTitle>
        </DialogHeader>

        <GroupPicker onFileSelected={onFileSelected} />
      </DialogContent>
    </Dialog>
  )
}

function GroupPicker({ onFileSelected }: { onFileSelected: (file: File) => void }) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeAccept, setActiveAccept] = useState(ALL_ACCEPT)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onFileSelected(file)
  }

  function triggerFilePicker(group: FileGroup | 'all') {
    const accept = group === 'all' ? ALL_ACCEPT : getGroupAccept(group)
    setActiveAccept(accept)
    // Use setTimeout so React re-renders the input with the new accept before clicking
    setTimeout(() => inputRef.current?.click(), 0)
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Hidden file input — accept changes with group selection */}
      <input
        ref={inputRef}
        type="file"
        accept={activeAccept}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Upload zone */}
      <label
        className={cn(
          'flex flex-col items-center gap-3 p-8 w-full',
          'border-2 border-dashed rounded-xl cursor-pointer',
          'hover:border-primary/50 transition-colors',
          'text-muted-foreground',
        )}
        onClick={() => triggerFilePicker('all')}
      >
        <Upload className="h-10 w-10" />
        <p className="text-sm font-medium">{t('openFile.dropHint')}</p>
        <p className="text-xs">{t('openFile.allFormats')}</p>
      </label>

      {/* Group filter dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            {t('openFile.filterByType')}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onClick={() => triggerFilePicker('all')}>
            {t('openFile.allTypes')}
          </DropdownMenuItem>
          {(['mesh', 'cad', 'bim', 'point', 'volume', 'animation', 'gcode', 'other'] as FileGroup[]).map((group) => (
            <DropdownMenuItem key={group} onClick={() => triggerFilePicker(group)}>
              {t(`fileGroup.${GROUP_LABELS[group]}`)} ({FILE_FORMATS.filter((f) => f.group === group).length})
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
