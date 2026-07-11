// A mock data source for PM5Mock: parses a Concept2 workout CSV export into
// the normalized sample array PM5Mock replays (see pm5-mock.js). Any future
// source (e.g. the Concept2 Logbook API) is a sibling module with the same
// shape: a function returning/resolving to that same array.

const csvSource = {

    // Concept2 workout CSV header:
    //   Number,"Time (seconds)","Distance (meters)","Pace (seconds)",
    //   Watts,Cal/Hr,"Stroke Rate","Heart Rate"
    // Rows are simple numeric CSV (no embedded commas); blank cells -> undefined.
    parseCsv(text) {
        const lines = text.trim().split(/\r?\n/).slice(1); // drop header
        const num = s => (s === '' || s === undefined) ? undefined : Number(s);
        return lines.filter(Boolean).map(line => {
            const cols = line.split(',');
            return {
                t:          num(cols[1]),
                distance:   num(cols[2]),
                pace:       num(cols[3]),
                watts:      num(cols[4]),
                calPerHour: num(cols[5]),
                strokeRate: num(cols[6]),
                heartRate:  num(cols[7]),
            };
        });
    },

    async loadFromUrl(url) {
        const text = await (await fetch(url)).text();
        return csvSource.parseCsv(text);
    },

    async loadFromFile(file) {
        return csvSource.parseCsv(await file.text());
    },
};

// ponytail: export shim so test/ can import parseCsv under node; a no-op in
// the browser (no `module`).
if (typeof module !== 'undefined') {
    module.exports = { csvSource };
}
