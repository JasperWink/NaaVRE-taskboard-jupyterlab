import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

/**
 * Initialization data for the @naavre/taskboard-jupyterlab extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@naavre/taskboard-jupyterlab:plugin',
  description: 'NaaVRE collaborative task board on Jupyter Lab',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry | null) => {
    console.log('JupyterLab extension @naavre/taskboard-jupyterlab is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('@naavre/taskboard-jupyterlab settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for @naavre/taskboard-jupyterlab.', reason);
        });
    }
  }
};

export default plugin;
