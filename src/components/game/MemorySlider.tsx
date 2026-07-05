import { Slider } from "@/components/ui/Slider";
import { useTranslation } from "@/i18n";
import { formatMemory } from "@/utils/format";
import { MIN_MEMORY, MAX_MEMORY } from "@/utils/constants";

interface MemorySliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function MemorySlider({ value, onChange }: MemorySliderProps) {
  const { t } = useTranslation();

  return (
    <Slider
      label={t("launch.memory")}
      min={MIN_MEMORY}
      max={MAX_MEMORY}
      step={256}
      value={value}
      onChange={onChange}
      formatValue={formatMemory}
    />
  );
}