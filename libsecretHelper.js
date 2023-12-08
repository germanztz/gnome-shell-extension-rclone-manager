#!/usr/bin/gjs
import GLib from 'gi://GLib'
import Secret from 'gi://Secret'

/* This schema is usually defined once globally */
const EXAMPLE_SCHEMA = new Secret.Schema("org.example.Password",
	Secret.SchemaFlags.NONE,
	{
		"number": Secret.SchemaAttributeType.INTEGER,
		"string": Secret.SchemaAttributeType.STRING,
		"even": Secret.SchemaAttributeType.BOOLEAN,
	}
);

  /*
  * The attributes used to later lookup the password. These
  * attributes should conform to the schema.
  */
  const attributes = {
    "number": "9",
    "string": "nine",
    "even": "false"
  };

function store_password(name, pass) {
  Secret.password_store_sync(EXAMPLE_SCHEMA, attributes, Secret.COLLECTION_DEFAULT, name, pass, null);
}

function retrieve_password(name) {
  return Secret.password_lookup_sync(EXAMPLE_SCHEMA, attributes, null);
}

// Get the password
let password = "secret" //GLib.spawn_command_line_sync("zenity --password --title='Password' --text='Enter the password to store:'")[1].toString().trim();

store_password("rclone",password);

// Retrieve the password
retrieve_password("Example password");
