import Utils from '../utils.js';

export class PatternExporter {
  static isDefaultValue(value, defaultVal) {
    if (value === defaultVal) return true;
    if (value === null && defaultVal === null) return true;
    if (Array.isArray(value) && Array.isArray(defaultVal) && value.length === 0 && defaultVal.length === 0) return true;
    return false;
  }

  static cleanNote(note) {
    const cleaned = {};
    for (const [key, val] of Object.entries(note)) {
      if (Utils.NOTE_RECALCULATED.includes(key)) continue;
      if (!(key in Utils.NOTE_DEFAULTS) || val !== Utils.NOTE_DEFAULTS[key]) {
        cleaned[key] = val;
      }
    }
    return cleaned;
  }

  static cleanTrack(track) {
    const cleaned = {};
    for (const [key, val] of Object.entries(track)) {
      if (Utils.TRACK_RECALCULATED.includes(key)) continue;
      if (!(key in Utils.TRACK_DEFAULTS)) {
        cleaned[key] = val;
        continue;
      }
      if (!this.isDefaultValue(val, Utils.TRACK_DEFAULTS[key])) {
        if (key === "notes") {
          cleaned[key] = val.map(n => this.cleanNote(n));
        } else {
          cleaned[key] = val;
        }
      }
    }
    return cleaned;
  }

  static cleanPattern(pattern) {
    const cleaned = {};
    for (const [key, val] of Object.entries(pattern)) {
      if (!(key in Utils.PATTERN_DEFAULTS) || !this.isDefaultValue(val, Utils.PATTERN_DEFAULTS[key])) {
        if (key === "tracks") {
          cleaned[key] = val.map(t => this.cleanTrack(t));
        } else {
          cleaned[key] = val;
        }
      }
    }
    return cleaned;
  }

  static export(pattern) {
    const cleaned = this.cleanPattern(pattern);
    return {
      application: "online-ordrumbox",
      url: "https://www.ordrumbox.com",
      ...cleaned
    };
  }
}