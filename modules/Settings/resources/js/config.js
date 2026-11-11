/**
 * Data passed from PHP (SettingsPage::bootstrap()).
 */
export const config = window.cpdfSettings || {};
export const OPTION = config.option || 'cpdf_settings';
export const limits = config.limits || {};
