import { LabIcon } from '@jupyterlab/ui-components';

import taskBoardIconSvgStr from '../style/icons/task-board-icon.svg';

export const taskBoardIcon = new LabIcon({
  name: 'naavre-task-board-icon',
  svgstr: taskBoardIconSvgStr
});
