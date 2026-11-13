import { usePanelResize } from '../../hooks/usePanelResize';
import { EditState } from '../../types';

export interface UseColorStudioOptions {
  editState: EditState;
  onChange: (newState: EditState) => void;
}

export function useColorStudio({ editState, onChange }: UseColorStudioOptions) {
  const {
    size: sidePanelWidth,
    handleResize: handleSidePanelResize,
    resetSize: resetSidePanelWidth,
  } = usePanelResize({
    initialSize: 310,
    minSize: 260,
    maxSize: 520,
    storageKey: 'kurolight_color_studio_sidebar_width',
  });

  const handleColorGradingChange = (newCg: typeof editState.color_grading) => {
    onChange({
      ...editState,
      color_grading: newCg,
    });
  };

  const handleCurvesChange = (newCurves: typeof editState.tone_curves) => {
    onChange({
      ...editState,
      tone_curves: newCurves,
    });
  };

  const handleLUTChange = (lutName: string | null, lutIntensity: number) => {
    onChange({
      ...editState,
      color_grading: {
        ...editState.color_grading,
        lut_name: lutName,
        lut_intensity: lutIntensity,
      },
    });
  };

  return {
    sidePanelWidth,
    handleSidePanelResize,
    resetSidePanelWidth,
    handleColorGradingChange,
    handleCurvesChange,
    handleLUTChange,
  };
}
