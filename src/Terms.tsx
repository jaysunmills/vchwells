export default function Terms({ onBack }: { onBack: () => void }) {
  return (
    <div className="terms-page">
      <div className="terms-container">
        <button className="terms-back" onClick={onBack}>← Back to vchwells.com</button>

        <h1>Terms of Use & Legal Disclaimer</h1>
        <p className="terms-effective">Effective May 27, 2026</p>

        <section>
          <h2>No Warranty</h2>
          <p>
            This site is provided strictly "AS IS" and "AS AVAILABLE" without warranty of any kind, express or implied,
            including but not limited to warranties of accuracy, completeness, fitness for a particular purpose,
            merchantability, or non-infringement. The authors and operators of vchwells.com make no representation
            that the information is current, complete, or free from errors.
          </p>
        </section>

        <section>
          <h2>Data Source & Process</h2>
          <p>
            This site aggregates publicly available well log records from
            the <a href="https://water.nv.gov" target="_blank" rel="noopener noreferrer">Nevada Division of Water Resources (NDWR)</a>,
            enriched with parcel boundary data from the State of Nevada ArcGIS service and selectively cross-referenced
            against scanned well log PDFs hosted by NDWR.
          </p>
          <p>
            Our data process includes the following steps:
          </p>
          <ul>
            <li>Importing raw well log records from the NDWR Well Log Query system</li>
            <li>Matching wells to parcel boundaries using the state assessor's parcel number (APN)</li>
            <li>Looking up parcel centroids from the official Nevada GIS service to correct known GPS coordinate issues</li>
            <li>Selectively reading the original scanned well log PDFs to verify APNs, addresses, and well data</li>
          </ul>
          <p>
            The source data is known to contain inaccuracies including but not limited to: incorrect GPS coordinates
            (particularly for wells drilled before GPS was widely adopted around 1990), transcription errors in APNs,
            missing or partial records, outdated parcel assignments, illegible scanned documents, and clerical errors.
            No independent verification has been performed on the majority of records.
          </p>
        </section>

        <section>
          <h2>Not Professional Advice</h2>
          <p>
            Nothing on this site constitutes legal, financial, real estate, engineering, hydrogeological, or any other
            professional advice. The information must not be relied upon for any decision involving property purchase,
            sale, valuation, drilling, permitting, water rights, mortgage qualification, insurance, litigation, or any
            other matter with legal or financial consequences.
          </p>
          <p>
            Always consult licensed professionals and verify all information directly with the Nevada Division of Water
            Resources, Storey County Assessor, and other authoritative sources before acting on any data.
          </p>
        </section>

        <section>
          <h2>No Affiliation</h2>
          <p>
            This site is an independent project and is not affiliated with, endorsed by, or sponsored by the State of
            Nevada, the Nevada Division of Water Resources, Storey County, the United States Geological Survey, or any
            other government agency.
          </p>
        </section>

        <section>
          <h2>Limitation of Liability</h2>
          <p>
            By using this site, you agree that the authors, operators, and contributors to vchwells.com shall not be
            liable for any direct, indirect, incidental, consequential, special, punitive, or any other damages arising
            out of or in connection with your use of, reliance on, or inability to use this site or its information,
            even if advised of the possibility of such damages. Your sole remedy for dissatisfaction with this site is
            to stop using it.
          </p>
        </section>

        <section>
          <h2>Privacy</h2>
          <p>
            Owner names appearing in our data have been abbreviated for privacy on the public-facing site. Underlying
            public records remain available via the official NDWR Well Log Query system. This site does not collect
            personal information from visitors, does not use tracking cookies, and does not share any user data.
          </p>
        </section>

        <section>
          <h2>Intellectual Property</h2>
          <p>
            Well log data, parcel data, and other government information presented on this site are public records
            and not subject to copyright. The vchwells.com presentation, interface, and code are © 2026 Jason Mills.
          </p>
        </section>

        <section>
          <h2>Changes to These Terms</h2>
          <p>
            These terms may be updated at any time without notice. Continued use of the site constitutes acceptance of
            any revised terms.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For questions about these terms or to report data issues, contact <a href="mailto:jason@jasonmills.io">jason@jasonmills.io</a>.
          </p>
        </section>

        <button className="terms-back" onClick={onBack}>← Back to vchwells.com</button>
      </div>
    </div>
  )
}
