use anyhow::{anyhow, ensure, Context, Result};
use json_event_parser::{JsonEvent, JsonReader, JsonWriter};
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
    let mut reader = JsonReader::from_reader(BufReader::new(decoder));

    let mut buffer = Vec::new();

    ensure!(
        reader.read_event(&mut buffer).expect("cannot parse JSON") == JsonEvent::StartObject,
        "blah"
    );

    loop {
        let event = reader.read_event(&mut buffer)?;
        log::debug!("{:?}", event);

        match event {
            JsonEvent::ObjectKey(_) => parse_deal(&mut reader, &mut buffer),
            JsonEvent::EndObject => {
                let event = reader.read_event(&mut buffer)?;
                if event == JsonEvent::Eof {
                    break;
                } else {
                    return Err(anyhow!(
                        "unexpected JSON event after EndObject: {:?}",
                        event
                    ));
                }
            }
            _ => return Err(anyhow!("unexpected JSON event: {:?}", event)),
        };
    }

    Ok(())
}

fn parse_deal<R: BufRead>(reader: &mut JsonReader<R>, buffer: &mut Vec<u8>) {
    let mut output = Vec::new();
    let mut writer = JsonWriter::from_writer(&mut output);

    let mut depth = 0;

    loop {
        let event = reader.read_event(buffer).expect("cannot parse JSON");
        if depth == 0 {
            assert_eq!(event, JsonEvent::StartObject,);
            log::debug!("==DEAL START==");
        }

        writer.write_event(event).expect("cannot write JSON");

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
        log::debug!("[{depth}] {event:?}");
    }

    log::debug!("==DEAL END==");

    output.push(b'\n');
    let _ = std::io::stdout().write(&output);
    let _ = std::io::stdout().flush();
    // println!("{}", std::str::from_utf8(&output).expect("malformed UTF-8"));
}
