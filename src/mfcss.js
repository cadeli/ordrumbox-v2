export default class MfCss {
    constructor() {
        this.css = `
#ordrumbox-v2 * {
    text-align: center;
    user-select: none;
    font-family: "Poppins", Arial, sans-serif;
    box-sizing: content-box;
    line-height: 1.2;
}

#ordrumbox-v2 body,
#ordrumbox-v2 html {
    margin: 0;
    height: 100%;
    position: relative;
    align-items: center;
    justify-content: center;
    font-family: monospace, sans-serif;
    background-color: #F7F6F4;
}

#ordrumbox-v2 body {
    overflow-y: scroll;
    /* Show vertical scrollbar */
}

#ordrumbox-v2 svg {
    pointer-events: none;
}

#ordrumbox-v2 .mf-button {
  margin: 10px;
  background: brown;
  display: grid;
  align-items: center;
  cursor: pointer;
  user-select: none;
  border-radius: 4px;
  padding: 4px;
  font-size: 12px; 
}


#ordrumbox-v2 .mf-button-sl {
  cursor: pointer;
  user-select: none;
  margin:auto;
}

#ordrumbox-v2 .mf-tb-button-large {
  overflow:none;
  height: 28px;
  width: 140px;
  max-width:140px;
  margin-left:4px;
  margin-right:4px;
  margin-top: 8px;
  border: 1px solid #555;
  border-radius: 4px;

  color: #ccc;
   font-size: 12px;
   font-weight: 600;
   text-transform: uppercase;
   letter-spacing: 0.05em;

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  user-select: none;
  flex-grow: 1;

  transition: all 0.2s ease;
}

#ordrumbox-v2 .mf-tb-button-large:hover {
  border-color: #666;
  color: #fff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

#ordrumbox-v2 .mf-tb-button-large:active {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

#ordrumbox-v2 .mf-tb-play {
  background: #1a5c1a;
}
#ordrumbox-v2 .mf-tb-play:hover {
  background: rgba(255,255,255,0.25);
}

#ordrumbox-v2 .mf-tb-clear {
  background: #8b3a3a;
}
#ordrumbox-v2 .mf-tb-clear:hover {
  background: rgba(255,255,255,0.25);
}

#ordrumbox-v2 .mf-tb-tools {
  background: #3a5c8b;
}
#ordrumbox-v2 .mf-tb-tools:hover {
  background: rgba(255,255,255,0.25);
}

#ordrumbox-v2 .mf-tb-button-large {
}

#ordrumbox-v2 .mf-tb-button {
  height: 28px;
  width: 60px;
  max-width:60px;
  margin-left:4px;
  margin-right:4px;
  margin-top: 8px;
  border: 1px solid #555;
  border-radius: 4px;

  color: #ccc;
   font-size: 12px;
   font-weight: 600;
   text-transform: uppercase;
   letter-spacing: 0.05em;

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  user-select: none;
  flex-grow: 1;

  transition: all 0.2s ease;
}

#ordrumbox-v2 .mf-tb-button:hover {
  background: rgba(255,255,255,0.15);
  border-color: #666;
  color: #fff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

#ordrumbox-v2 .mf-tb-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

/* Modal Pick Sound buttons - higher contrast */
#ordrumbox-v2 .modal-pick-buttons .mf-tb-button {
  background: #4a4a4a;
  border: 1px solid #777;
  padding: 10px 20px;
  min-width: 80px;
}

#ordrumbox-v2 .modal-pick-buttons .mf-tb-button:hover {
  background: #5a5a5a;
  border-color: #888;
  color: #fff;
}

#ordrumbox-v2 .sample-list-title {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #eee;
  text-transform: uppercase;
}

#ordrumbox-v2 .sample-listbox {
  width: 100%;
  min-width: 240px;
  min-height: 240px;
  padding: 6px;
  margin: 0;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #2f2f2f;
  background: linear-gradient(180deg, #1f1f1f, #101010);
  color: #f5f5f5;
  font-size: 12px;
  line-height: 1.35;
  text-align: left;
  outline: none;
  overflow-y: auto;
}

#ordrumbox-v2 .sample-listbox option {
  padding: 6px 8px;
  border-radius: 4px;
  text-align: left;
}

#ordrumbox-v2 .sample-listbox option:checked {
  background: #00bcd4 linear-gradient(180deg, #00bcd4, #00a6bb);
  color: #000;
}

#ordrumbox-v2 .sample-listbox:focus {
  border-color: #00bcd4;
  box-shadow: 0 0 0 2px rgba(0, 188, 212, 0.25);
}

#ordrumbox-v2 .sample-analysis {
  display: grid;
  gap: 4px;
  margin: 10px 8px 0 8px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #2f2f2f;
  background: linear-gradient(180deg, #171717, #0f0f0f);
  color: #eee;
  font-size: 11px;
}

#ordrumbox-v2 .sample-analysis-row {
  display: grid;
  grid-template-columns: minmax(120px, 160px) 1fr;
  gap: 8px;
  align-items: start;
}

#ordrumbox-v2 .sample-analysis-label {
  text-align: left;
  color: #9edbff;
  font-weight: 700;
}

#ordrumbox-v2 .sample-analysis-value {
  text-align: left;
  word-break: break-word;
}

#ordrumbox-v2 .mf-button:hover {
  background: linear-gradient(180deg, #777, #555);
}
/* ATT bug sliders
#ordrumbox-v2 .mf-button:active {
  transform: translateY(1px);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.6);
}
*/

#ordrumbox-v2 a:link {
  text-decoration: none;
  color:white; /* for export btn*/
}

#ordrumbox-v2 a:visited {
  text-decoration: none;
}

#ordrumbox-v2 a:hover {
  text-decoration: none;
}

#ordrumbox-v2 a:active {
  text-decoration: none;
}

/* drop box start*/
/* DROPBOX CONTAINER */
#ordrumbox-v2 .mf-dropbox {
  position: relative;
  width: 100%;
  height: 100%;
  z-index: 9999;
}

/* TITLE (button face) */
#ordrumbox-v2 .mf-dropbox-title {
  width: 100%;
  height: 100%;
  padding: 0 6px;

  display: flex;
  align-items: center;
  justify-content: center;

   font-size: 12px;
   letter-spacing: 0.05em;

  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

#ordrumbox-v2 .mf-dropbox-title:hover {
  background: rgba(255,255,255,0.1);
}

/* LIST */
#ordrumbox-v2 .mf-dropbox-list {
  position: relative;
  display:none;
  margin-top:3em;
  bottom: calc(100% + 4px);
  left: 0;

  min-width: 160px;
  max-height: 200px;
  overflow-y: auto;

  background: linear-gradient(180deg, #222, #161616);
  border: 1px solid #000;
  border-radius: 6px;

  box-shadow: 0 6px 18px rgba(0,0,0,0.7);
  z-index: 9999;
}

/* ITEMS */
#ordrumbox-v2 .mf-dropbox-item {
  padding: 6px 10px;
   font-size: 12px;

  color: #eee;
  cursor: pointer;
  white-space: nowrap;

  transition: background 0.12s ease;
}

#ordrumbox-v2 .mf-dropbox-item:hover {
  background: #555;
  cursor: pointer;
}


#ordrumbox-v2 .selected-button {
  background: #00bcd4;
  color: #000;
  font-weight: 800;
}

/* SELECTED ITEM */
#ordrumbox-v2 .mf-dropbox-item.selected {
  background: #00bcd4;
  color: #000;
  font-weight: 800;
}

/* SCROLLBAR */
#ordrumbox-v2 .mf-dropbox-list::-webkit-scrollbar {
  width: 6px;
}

#ordrumbox-v2 .mf-dropbox-list::-webkit-scrollbar-thumb {
  background: #666;
  border-radius: 6px;
}


/* drop box end*/ 


#ordrumbox-v2 .label {
    border: 4px solid transparent;
    padding: 5px;
    text-align: center;
    min-width: 22px;
}

#ordrumbox-v2 .inputLabel {
  padding: 5px;
  text-align: left;
  min-width: 100px;
}
  #ordrumbox-v2 .inputLabel-lb {
  padding: 5px;
  text-align: left;
  min-width: 20px;
}

#ordrumbox-v2 input[type="file"] {
    display: none;
}

#ordrumbox-v2 .labelLong {
    margin: auto;
    color: white;
    font-size: 18px;
}

#ordrumbox-v2 .midi-indicators {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 4px 2px 4px;
}

#ordrumbox-v2 .midi-indicator-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  color: #fff;
  font-size: 11px;
  letter-spacing: 0.04em;
}

#ordrumbox-v2 .midi-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid #111;
  box-shadow: inset 0 0 2px rgba(255,255,255,0.25), 0 0 6px rgba(0,0,0,0.45);
  flex: 0 0 10px;
}

#ordrumbox-v2 .midi-indicator-on {
  background: #15ff6d;
}

#ordrumbox-v2 .midi-indicator-off {
  background: #4a4a4a;
}

#ordrumbox-v2 .midi-indicator-text {
  min-width: 120px;
  text-align: left;
}

#ordrumbox-v2 .mf-title-box {
  background: chocolate;
  height: 20px;
  margin:4px;
}

  #ordrumbox-v2 .mf-title-box-c {
  background: chocolate;
  height: 23px;
  display: flex;
  flex-direction: row;
  padding-right: 20px;
}

#ordrumbox-v2 .ctrl-pannel {
    border-radius: 5px;
    border: 4px solid #444;
    color: #fff;
    background: #555;
    display: grid;
    grid-template-columns: 1fr 1fr ;
    padding-top: 8px;
    margin: 8px;
}

#ordrumbox-v2 .line-controls {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    flex-direction: row;
    background-color: black;
}

#ordrumbox-v2 .line-controls-d {
    display: flex;
    flex-wrap: wrap;
    flex-direction: row;
    background-color: black;
}


#ordrumbox-v2 .box-grid {
    display: grid;
  }

#ordrumbox-v2 .box-v {
    flex-wrap: wrap;
    display: flex;
    flex-direction: row;
    justify-content: center;
}

#ordrumbox-v2 .box-h {
    flex-wrap: wrap;
    display: flex;
    flex-direction: column;
    margin-left: 4px;
    margin-right: 4px;
}


#ordrumbox-v2 .sliders-block {
    border-radius: 5px;
  border: 4px solid #cbc4c4;
  color: #fff;
  display:grid;
  background: #161515;
  padding-top: 8px;
  margin: 8px;
}

#ordrumbox-v2 .sliders-block-d {
    border-radius: 5px;
    color: #fff;
    display: flex;
    flex-direction: column;
    padding-top: 8px;
    margin: 8px;
    border: solid white 2px;
}

#ordrumbox-v2 .sliders-block-e {
    border-radius: 5px;
    flex-wrap: wrap;
    color: #fff;
    display: flex;
    padding-top: 8px;
    margin: 8px;
    border: solid white 2px;
}


#ordrumbox-v2 .trackCtrlInternalPanel {
    display: flex;
    justify-content: space-around;
    padding-top: 20px;
}

#ordrumbox-v2 .trackBtn {
    display: flex;
    gap: 2px;
    min-width: 80px;
    width: 80px;
    padding: 5px 7px;
    text-align: center;
    cursor: pointer;
    outline: none;
    color: #f6f4f4;
    background:brown;
    border: 1px solid #444;
    font-size: 12px;
}

#ordrumbox-v2 .trackBtnSel {
    display: flex;
    gap: 2px;
    min-width: 80px;
    width: 80px;
    padding: 5px 7px;
    text-align: center;
    cursor: pointer;
    outline: none;
    color: #fff;
    background: blueviolet;
    border: 1px solid #f8f3f3;
    font-size: 12px;
}

#ordrumbox-v2 .trackBtn:hover {
    background-color: #202020;

}

#ordrumbox-v2 .trackBtn:active {
    background-color: #404040;
    box-shadow: 0 5px #666;
    transform: translateX(4px);
}

#ordrumbox-v2 .trackNbBars {
    border: 1px solid #444;
    width: 24px;
    height: 24px;
    min-width: 24px;
    padding-top: 4px;
    background: #555;
}

#ordrumbox-v2 .trackLoopPoint {
    border: 1px solid #444;
    width: 24px;
    height: 24px;
    padding-top: 4px;
    min-width: 24px;
    background: #555;
}

#ordrumbox-v2 .trackMuteBtnOff {
    border: 1px solid #444;
    width: 12px;
    min-width: 12px;
    background: #000;
}

#ordrumbox-v2 .trackMuteBtnOn {
    border: 1px solid #444;
    width: 12px;
    min-width: 12px;
    background: #066;
}

#ordrumbox-v2 .trackAutoBtnOff {
    border: 1px solid #444;
    width: 12px;
    min-width: 12px;
    background: #000;
}

#ordrumbox-v2 .trackAutoBtnOn {
    border: 1px solid #444;
    width: 12px;
    min-width: 12px;
    background: #066;
}


#ordrumbox-v2 .trackDispl {
    display: flex;
}

#ordrumbox-v2 .trackDisplNone {
    display: none;
}

#ordrumbox-v2 .orbar {
    width: 25%;
    border-left: 4px solid #800;
    display: inline-flex;
}

#ordrumbox-v2 .notesList {
    width: 100%;
    display: inline-flex;
}

#ordrumbox-v2 .noteDispl {
    border: 1px solid #444;
    background: #555;
    flex: 1 1 0px;
    display: flex;
    align-items: center;
    justify-content: left;
}

#ordrumbox-v2 .noteDisplNote {
    border: 2px solid #444;
    border-radius: 9px;
    flex: 1 1 0px;
    min-height: 21px;
    background-color: #222;
    line-height: 1.3em;
}

#ordrumbox-v2 .noteDisplLoop {
    border: 2px solid #444;
    width: 4px;
    border-radius: 9px;
    background: #FFF;
    min-height: 20px;
}

#ordrumbox-v2 .noteDisplSel {
    outline: 4px solid #8080FF;
    outline-offset: -4px
}

#ordrumbox-v2 .ctrlLabel {
    cursor: pointer;
    width: 100px;
}

#ordrumbox-v2 .ctrlValueLfoOn {
    cursor: pointer;
    text-align: right;
      padding: 5px;
    min-width:20px;

}

#ordrumbox-v2 .ctrlValueLfoOff {
    cursor: pointer;
    text-align: right;
      padding: 5px;
    min-width:20px;
}

#ordrumbox-v2 .inputText {
    margin: 20px;
    background: #ADD8E6;
}

#ordrumbox-v2 .audioFrame {
    padding: 10px 20px;
    margin: 4px;
}


#ordrumbox-v2 .loading-box {
    display: flex;
    align-items: center;
}

#ordrumbox-v2 .modal-content {
    margin: 10% auto;
    padding: 20px;
    width: 80%;
    max-height: 80%;
    overflow-y: auto;
    background: #080808;
    border: 4px solid #555;
    border-radius: 13px;
}

#ordrumbox-v2 .inputValue {
    padding: 5px;
    background: transparent;
    color: white;
}

#ordrumbox-v2 .inputValueLbl {
    width: 100px;
    text-align: left;
    display: inline-block;
}

#ordrumbox-v2 .inputValueForListLbl {
    width: 80px;
    text-align: center;
    display: inline-block;
    background: #000;
    overflow: clip;
    padding:2px
}

#ordrumbox-v2 .inputValueForListLblBig {
    width: 80px;
    text-align: center;
    display: inline-block;
    background: #000;
}

#ordrumbox-v2 .input-box-list {
    display: inline-flex;
}

#ordrumbox-v2 .inputBox:hover {
    color: #0F0
}

#ordrumbox-v2 input[type="range"]  {
    background-color: #000; 
    background-size: 100% 5px;
    background-position: center;
    background-repeat: no-repeat;
    overflow: hidden;
    outline: none;
    cursor: pointer;
    vertical-align: middle;
}

input[type="range"]::-moz-range-progress {
  background-color: #fff; 
}
input[type="range"]::-moz-range-track {  
  background-color: #000;
}

@media screen and (-webkit-min-device-pixel-ratio:0) {
    input[type='range'] {
      overflow: hidden;
      width: 120px;
      -webkit-appearance: none;
      background-color: #9a905d;
    }
    
    input[type='range']::-webkit-slider-runnable-track {
      height: 10px;
      -webkit-appearance: none;
      color: #fff;
      margin-top: -1px;
    }
    
    input[type='range']::-webkit-slider-thumb {
      width: 10px;
      -webkit-appearance: none;
      height: 10px;
      cursor: ew-resize;
      background: #434343;
      box-shadow: -80px 0 0 80px #fff;
    }
}

#ordrumbox-v2 .twostatesOn {
    background: #28a745 !important;
    color: #fff !important;
    font-size: 12px;
    font-weight: 600;
    border-color: #28a745 !important;
}
#ordrumbox-v2 .twostatesOff {
    background: #3a3a3a !important;
    color: #aaa !important;
    font-size: 12px;
    font-weight: 600;
}

#ordrumbox-v2 .twostatesOn:hover,
#ordrumbox-v2 .twostatesOff:hover {
    background: rgba(255,255,255,0.25) !important;
}


/* sliders */
#ordrumbox-v2 .tooltip {
    position: relative;
    display: inline-block;
    text-align: left;
    color: #fff;
    flex-wrap: nowrap;
    display: flex;
    
}

#ordrumbox-v2 .tooltiptext {
    display: none;
    background-color: black;
    color: grey;
    text-align: center;
    border-radius: 6px;
    padding: 6px;
    border: solid;
    position: absolute;
    z-index: 1;
    margin-top:2em;
}


#ordrumbox-v2 #mixerCtrl {
    position: absolute;
    padding-left: 20px;
}

#ordrumbox-v2 #toolbar {
    display:flex;
    position: relative;
    z-index: 100;
}

#ordrumbox-v2 #main {
    display: flex;
    flex-direction: column;
}

@media (width <= 768px) {
#ordrumbox-v2 #toolbar {
    margin-top: 9px;
    min-height: 80px;
}
    }

#ordrumbox-v2 #showPattern {
    display: block;
    min-height: 320px;
}

#ordrumbox-v2 #showMixerCtrl {
    display: none;
    padding: 2px;
    flex-wrap: wrap;
    flex-direction: row;
}

#ordrumbox-v2 #showTrackCtrl {
    display: flex;
}

#ordrumbox-v2 #showNoteCtrl {
    display: flex;
}

#ordrumbox-v2 #showLfoCtrl {
    display: flex;
}

#ordrumbox-v2 #download {
    display: none;
}

#ordrumbox-v2 #stepProgression {
    height: 16px;
    display: flex;
    align-items: center;
    overflow: hidden;
}

#ordrumbox-v2 #stepProgressionPad {
    width: 180px;
    min-width: 180px;
    height: 16px;
    flex: 0 0 180px;
}

#ordrumbox-v2 #stepProgressionRule {
    position: relative;
    flex: 1 1 auto;
    height: 16px;
    min-width: 0;
    margin-right: 8px;
    border-radius: 999px;
    background: #000;
    overflow: hidden;
}

#ordrumbox-v2 #stepProgressionMark {
    position: absolute;
    left: 0;
    top: 0%;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: #ADD8E6;
    #transform: translateY(-50%);
    #box-shadow: 0 0 8px rgba(173, 216, 230, 0.55);
}

#ordrumbox-v2 #loading-box {
    height:20px;
    background-color: #000000;
    display: flex;
    flex-direction: column;
    justify-content: center;
      line-height: 50px;
    align-items: center;
    z-index: 9999;
    font-family: 'Courier New', Courier, monospace; /* Style technique */
    color: #ff9800; /* Orange LED */

}

#ordrumbox-v2 #resourcesProgress {
    display: block;
    width: 100%;
    height: 40px;
    background: #000;
    border-radius: 2px;
    overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
}

#ordrumbox-v2 #resourcesProgressBar {
    display: block;
    width: 0%; /* À piloter en JS */
    height: 100%;
    background: #ff9800;
    box-shadow: 0 0 15px #ff9800;
    transition: width 0.3s ease;
}



#ordrumbox-v2 #modal-title {
    display: flex;
}

#ordrumbox-v2 #modal-title-text {
    flex-grow: 1;
    font-size: 26px;
    color: #f1eeee;
}

#ordrumbox-v2 #modal-message {
    color: white;
    display: flex;
    justify-content: center;
    border-top: 5px solid #0f0f0f;
    padding: 20px;
}

#ordrumbox-v2 #modal-close {
    color: #f4f0f0;
    float: right;
    font-size: 48px;
    font-weight: bold;
    line-height: 0.9;
}

#ordrumbox-v2 #modal-close:hover,
#ordrumbox-v2 #modal-close:focus {
    color: #ff3333;
    text-decoration: none;
    cursor: pointer;
}

#ordrumbox-v2 #visu-modal {
    display: none;
    position: fixed;
    z-index: 1;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
}

#ordrumbox-v2 #warn-modal {
    display: none;
    position: fixed;
    z-index: 1;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
}
    `;
    }

    // Inject the CSS into the <head>
    inject() {
        if (!document.getElementById("ordrumbox-style")) {
            const style = document.createElement("style");
            style.id = "ordrumbox-style";
            style.textContent = this.css;
            document.head.appendChild(style);
            console.log("✅ Ordrumbox CSS injected .");
        }
    }
}
