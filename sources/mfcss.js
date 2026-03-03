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
overflow: none;
  max-height: 34px;
  margin: 4px;
  background: brown;
  text-transform: uppercase;
  display: grid;
  align-items: center;
  cursor: pointer;
  user-select: none;
  min-width: 151px;
  min-height: 34px;
 border-radius: 4px;
}

#ordrumbox-v2 .mf-tb-button-large {
  overflow:none;
  height: 24px;
  width: 140px;
  max-width:140px;
  margin-left:2px;
  margin-right:2px;
  background: linear-gradient(180deg, #666, #444);
  border: 1px solid #222;
  border-radius: 6px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.15),
    0 2px 4px rgba(0,0,0,0.5);

  color: #fff;
   font-size: 12px;
  text-transform: uppercase;

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  user-select: none;
  flex-grow: 1;

  transition: background 0.15s ease, transform 0.05s ease;
}

#ordrumbox-v2 .mf-tb-button {
  height: 24px;
  width: 60px;
  max-width:60px;
  margin-left:2px;
  margin-right:2px;
  background: linear-gradient(180deg, #666, #444);
  border: 1px solid #222;
  border-radius: 6px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.15),
    0 2px 4px rgba(0,0,0,0.5);

  color: #fff;
   font-size: 12px;
  text-transform: uppercase;

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  user-select: none;
  flex-grow: 1;

  transition: background 0.15s ease, transform 0.05s ease;
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

/* drop box start*/
/* DROPBOX CONTAINER */
#ordrumbox-v2 .mf-dropbox {
  position: relative;
  width: 100%;
  height: 100%;
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
  text-transform: uppercase;
  letter-spacing: 0.05em;

  cursor: pointer;
  user-select: none;
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
  z-index: 1000;
}

/* ITEMS */
#ordrumbox-v2 .mf-dropbox-item {
  padding: 6px 10px;
   font-size: 12px;
     text-transform: uppercase;

  color: #eee;
  cursor: pointer;
  white-space: nowrap;

  transition: background 0.12s ease;
}

#ordrumbox-v2 .mf-dropbox-item:hover {
  background: #444;
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
#ordrumbox-v2 .mf-title-box {
  background: chocolate;
  display: grid;
  grid-template-columns: 5fr 1fr;
  padding: 3px;
  margin: 2px;
  margin-bottom: 12px;
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
    border: solid;
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
    border: 4px solid #444;
    color: #fff;
    background: #555;
    flex: 1 1 0px;
    display: flex;
    flex-direction: column;
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
    min-width: 48px;
    width: 48px;
    padding: 5px 7px;
    text-align: center;
    cursor: pointer;
    outline: none;
    color: #fff;
    background-color: #000;
    border: 1px solid #444;
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
    background: #BBD1CA;
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
    width: 40px;
    text-align: center;
    display: inline-block;
    background: #000;
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


#ordrumbox-v2 .twostates {
    background: linear-gradient(180deg, #00bcd4, #0097a7);
    color: #000;
    border-color: #007c91;
    box-shadow:inset 0 1px 2px rgba(255,255,255,0.4),0 0 10px rgba(0,188,212,0.6);
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
    display: grid;
    padding-left: 20px;
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
    height: 12px;
    display: flex;
}

#ordrumbox-v2 #stepProgressionPad {
    width: 135px;
    height: 12px;
}

#ordrumbox-v2 #stepProgressionRule {
    height: 12px;
}

#ordrumbox-v2 #stepProgressionMark {
    left: 0;
    Top: 0;
    width: 24px;
    height: 14px;
    background: #ADD8E6;
    margin-left: 100px;
}

#ordrumbox-v2 #resourcesProgress {
    display: none;
}

#ordrumbox-v2 #modal-title {
    display: flex;
}

#ordrumbox-v2 #modal-title-text {
    flex-grow: 1;
    font-size: 26px;
    color: #555;
}

#ordrumbox-v2 #modal-message {
    color: white;
    display: flex;
    justify-content: center;
    border-top: 5px solid #555;
    padding: 20px;
}

#ordrumbox-v2 #modal-close {
    color: #555;
    float: right;
    font-size: 48px;
    font-weight: bold;
    line-height: 0.9;
}

#ordrumbox-v2 #modal-close:hover,
#ordrumbox-v2 #modal-close:focus {
    color: #000;
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




