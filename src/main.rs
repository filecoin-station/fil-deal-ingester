use json_event_parser::{FromReadJsonReader, JsonEvent, ToWriteJsonWriter};
use anyhow::{bail, ensure, Context, Result};
use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};

fn main() -> Result<()> {
    env_logger::init();

    let infile = env::args()
        .nth(1)
        .context("Missing required argument: path to StorageMarketDeals.json.zst")?;

    ensure!(
        infile.ends_with(".json.zst"),
        "The StorageMarketDeals file must have .json.zst extension"
    );

    let f = File::open(&infile).context("cannot open input file")?;
    let decoder =
        zstd::stream::Decoder::new(BufReader::new(f)).context("cannot create zstd decoder")?;
    let mut reader = FromReadJsonReader::new(BufReader::new(decoder));

    let start_event = reader
        .read_next_event()
        .context("cannot parse JSON")?;

    ensure!(start_event == JsonEvent::StartObject);

    loop {
        let event = reader.read_next_event()?;
        log::debug!("{:?}", event);

        match event {
            JsonEvent::ObjectKey(_) => parse_deal(&mut reader)?,
            JsonEvent::EndObject => match reader.read_next_event()? {
                JsonEvent::Eof => break,
                event => {
                    bail!("unexpected JSON event after EndObject: {:?}", event);
                }
            },
            _ => bail!("unexpected JSON event: {:?}", event),
        }
    }

    Ok(())
}

fn parse_deal<R: BufRead>(reader: &mut FromReadJsonReader<R>) -> Result<()> {
    let mut output = Vec::new();
    let mut writer = ToWriteJsonWriter::new(&mut output);

    let mut depth = 0;

    loop {
        let event = reader.read_next_event().context("cannot parse JSON")?;
        if depth == 0 {
            ensure!(event == JsonEvent::StartObject);
            log::debug!("==DEAL START==");
        }

        match event {
            JsonEvent::StartObject => {
                depth += 1;
            }
            JsonEvent::EndObject => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            _ => {}
        }

        writer.write_event(event).context("cannot write JSON")?;
    }

    log::debug!("==DEAL END==");
    output.push(b'\n');
    let _ = std::io::stdout().write(&output);
    let _ = std::io::stdout().flush();
    Ok(())
}
