import Utils from '../utils.js'

export default class MfDropBox {
  static TAG = "MFDROPBOX"


  constructor(label) {
    this.label = label
  }

  addDropbox = (title, itemList, selectedItem, id, parentDiv, onClickOnItem) => {
    this.onClickOnItem = onClickOnItem
    let dropboxdiv = Utils.createMfElement("div", id, "mf-dropbox", parentDiv)
    this.dropboxtitlediv = Utils.createMfElement("div", null, "mf-dropbox-title", dropboxdiv)
    this.setTitle(title)
    this.itemlistdiv = Utils.createMfElement("div", null, "mf-dropbox-list", dropboxdiv)
    let _this = this
    this.dropboxtitlediv.onclick = function (event) {
       event.stopPropagation()
      Utils.toggleDisplayDiv(_this.itemlistdiv)
    }
    //this.fillDropBox(itemList, selectedItem)
    return this
  }

  setSelectedItemNum = (itemNum, prefix) => { //TODO
    //this.setTitle("<b>"+prefix+"</b>:"+selectedItem.name)
  }

  setTitle = (title, prefix) => {
    if (!prefix) return;
    if (!title) return;
    if (title.length> 8) { 
      title=title.slice(0,7)
    }
    if (prefix.length> 4) { 
      prefix=prefix.slice(0,3)
    }
    this.dropboxtitlediv.innerHTML = "<b>"  + prefix + "</b>:" + title + " ▾"
  }

  fillDropBox = (itemList, selectedItem, prefix) => {
    Utils.clearInnerDom(this.itemlistdiv)
    if (!selectedItem) {
      console.error("MfdropBox::fillDropBox att: no selecteditem ")
    } else {
      //console.log("MfdropBox::fillDropBox "+this.label+" sel=" + selectedItem.name + ":    add itemlist : ", itemList)
      this.setTitle(selectedItem.name, prefix)
    }

    Object.values(itemList).forEach((item, indexItem) => {
      let itemdiv = Utils.createMfElement("div", null, "mf-dropbox-item", this.itemlistdiv)
      itemdiv.innerText = item.name // ATT assume this is orDrumboxobject
      if (item === selectedItem) {
        itemdiv.classList.add("selected")
      } else {
        itemdiv.classList.remove("selected")
      }

      const _this = this
      itemdiv.onclick = function (event) {
        console.log("MfdropBox::fillDropBox click on item : ", indexItem, " = ", item.name)
        _this.onClickOnItem(indexItem)
      }
    })
  }


}    
