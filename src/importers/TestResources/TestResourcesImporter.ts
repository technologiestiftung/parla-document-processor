import { SupabaseClient, createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { DocumentImporter, Settings } from "../../interfaces/Common.js";

export class TestResourcesImporter implements DocumentImporter {
	documentType: string = "Webseite";
	settings: Settings;
	sql: postgres.Sql<{}>;
	supabase: SupabaseClient<any, "public", any>;

	constructor(settings: Settings) {
		this.settings = settings;
		this.sql = postgres(settings.postgresConnection);
		this.supabase = createClient(
			settings.supabaseUrl,
			settings.supabaseServiceRoleKey,
		);
	}

	async import(): Promise<number> {
		const testDocuments = [
			{
				source_url:
					"https://www.parlament-berlin.de/adosservice/19/Haupt/vorgang/h19-1579-v.pdf",
				source_type: "Hauptausschussprotokoll",
				metadata: {
					href: "https://www.parlament-berlin.de/adosservice/19/Haupt/vorgang/h19-1579-v.pdf",
					name: "h19-1579-v.pdf",
					size: 1484,
					text: " <br>5. Umsetzungsbericht E-Government-Gesetz-Berlin<br>gemäß Auflage A. 23 - Drucksache 19/1350 zum Haushalt 2024/25",
					title: "Bericht RBm - Skzl - V A 1 Sch - vom 22.03.2024",
					status: "Erledigt",
					category: "Bericht",
					processId: "1579",
					meetingIds: [60],
				},
			},
			{
				source_url:
					"https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/SchrAnfr/S19-10124.pdf",
				source_type: "Schriftliche Anfrage",
				metadata: {
					Sb: ["1-18"],
					Wp: ["19"],
					Desk: ["Organisierte Kriminalität"],
					DHerk: ["BLN"],
					DokNr: ["19/10124"],
					Titel: [
						"Organisierte Kriminalität – Polizeieinsätze, Datenerhebung und Statistik im Bereich sogenannter „Clankriminalität”",
					],
					DHerkL: ["Berlin"],
					DokArt: ["Drs"],
					DokDat: ["16.11.2021"],
					DokTyp: ["SchrAnfr"],
					LokURL: [
						"https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/SchrAnfr/S19-10124.pdf",
					],
					ReihNr: ["0001"],
					DokArtL: ["Drucksache"],
					DokTypL: ["Schriftliche Anfrage"],
					NrInTyp: ["19/10124"],
					Urheber: ["Schrader, Niklas (Die Linke)", "Helm, Anne (Die Linke)"],
				},
			},
			{
				source_url:
					"https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/SchrAnfr/S19-12085.pdf",
				source_type: "Schriftliche Anfrage",
				metadata: {
					Wp: ["19"],
					Desk: ["Bezirksverwaltung"],
					DHerk: ["BLN"],
					DokNr: ["19/12085"],
					Titel: ["Wie weiter mit dem 14-Tage-Ziel in den Bürgerämtern"],
					DHerkL: ["Berlin"],
					DokArt: ["Drs"],
					DokDat: ["03.06.2022"],
					DokTyp: ["SchrAnfr"],
					LokURL: [
						"https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/SchrAnfr/S19-12085.pdf",
					],
					ReihNr: ["0001"],
					DokArtL: ["Drucksache"],
					DokTypL: ["Schriftliche Anfrage"],
					NrInTyp: ["19/12085"],
					Urheber: ["Klein, Hendrikje (Die Linke)"],
					Abstract: [
						"Umsetzung der Maßnahmen aus der fachlichen Zielvereinbarung Bürgerämter des Senats mit den Bezirken.",
					],
				},
			},
			{
				source_url:
					"https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/SchrAnfr/S19-15643.pdf",
				source_type: "Schriftliche Anfrage",
				metadata: {
					Wp: ["19"],
					Desk: ["Kirchenaustritt"],
					DHerk: ["BLN"],
					DokNr: ["19/15643"],
					Titel: ["OZG umsetzen - Kirchenaustritt auch online?"],
					DHerkL: ["Berlin"],
					DokArt: ["Drs"],
					DokDat: ["24.05.2023"],
					DokTyp: ["SchrAnfr"],
					LokURL: [
						"https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/SchrAnfr/S19-15643.pdf",
					],
					ReihNr: ["0001"],
					DokArtL: ["Drucksache"],
					DokTypL: ["Schriftliche Anfrage"],
					NrInTyp: ["19/15643"],
					Urheber: ["Schneider, Julia (Grüne)", "Ziller, Stefan (Grüne)"],
					Abstract: ["Onlinezugangsgesetz (OZG)"],
				},
			},
		];
		const values = testDocuments.map((ld) => {
			return {
				source_type: ld.source_type,
				source_url: ld.source_url,
				metadata: ld.metadata,
				registered_at: new Date(),
			};
		});

		await this.supabase.from("registered_documents").insert(values);

		return 1;
	}
}
