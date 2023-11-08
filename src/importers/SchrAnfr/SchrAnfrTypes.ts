export interface Nebeneintrag {
	ReihNr: string[];
	Desk: string[];
}

export interface Dokument {
	Abstract: string[];
	Urheber: string[];
	ReihNr: string[];
	DHerk: string[];
	DHerkL: string[];
	Wp: string[];
	DokArt: string[];
	DokArtL: string[];
	DokTyp: string[];
	DokTypL: string[];
	NrInTyp?: string[];
	Desk: string[];
	Titel: string[];
	DokNr: string[];
	DokDat: string[];
	LokURL: string[];
	Sb?: string[];
	VkDat?: string[];
	HNr?: string[];
	Jg?: string[];
}

export interface Vorgang {
	VNr: string[];
	ReihNr: string[];
	VTyp: string[];
	VTypL: string[];
	VSys: string[];
	VSysL: string[];
	VFunktion: string[];
	VIR: string[];
	Nebeneintrag: Nebeneintrag[];
	Dokument: Dokument[];
}
export interface ParDoks {
	Export: {
		$: { aktualisiert: Date };
		Vorgang: Vorgang[];
	};
}
