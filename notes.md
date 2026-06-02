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


Samples (ligne ~143): track.velocity * 16 → à vitesse 1.0 = gain 16
Synth (ligne ~399): track.velocity / 2 → à vitesse 1.0 = gain 0.5


npx vitest run tests/profile_heavy_song.test.js → écrit un run
Faire des optimisations
Re-run → diff s'affiche
cat profile_logs/profile_history.jsonl | jq pour historique


   * npm run electron:dev : Pour lancer l'application dans une fenêtre logicielle immédiatement.
   * npm run electron:build : Pour générer l'installeur final (dans le dossier release/).
