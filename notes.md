Voici les noms qui pourraient être plus explicites :

Actuel	Problème	Suggestion
mfCmd	Trop court, pas clair	commandHandler
mfMixer	Trop court	audioMixer
mfGlobals	Trop générique	appState ou garder
MfCmd (class)	Préfixe non nécessaire	CommandHandler
MfStrip	Préfixe non nécessaire	AudioStrip
MfSound	Trop générique	SoundEngine
MfPlayer	Trop générique	Sequencer
mfResourcesLoader	Trop long	resourceLoader
mfAutoAssign	Pas clair	soundAutoAssigner
mfAutoGenerate	Trop générique	trackGenerator
mfAutoCompose	Trop générique	patternComposer
mfSerialize	Pas clair	serializationHandler
flatNote	Pas clair	playableNote
isNoteAt	Retourne array	findNotesAt ou getNotesAt
incrNbStepPerBar	incr = unclear	incrementStepsPerBar
incrLoopPoint	incr = unclear	incrementLoopPoint
cleanPattern	Trop vague	normalizePattern
importPatternFromJson	Trop long	importPattern
setSelectedPatternNum	Num = index	setSelectedPatternIndex
setSelectedDrumkitNum	Num = index	setSelectedDrumkitIndex
addStrip	Strip = audio channel	addChannel
getTrackFromType	Retourne track par nom	getTrackByName
isTrigged	Nom de méthode unusual	shouldTrigger
convertPatternStepToBarStep	Trop long	patternStepToBarStep
convertBarStepToPatternStep	Trop long	barStepToPatternStep
convertAllTo4stepPerBar	Pas clair	normalizeTo4StepsPerBar
