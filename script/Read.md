# Gramer ShellScript

## Grammar check in ShellScript

- bash -n <shellscript.sh>

## Check the presence or absence of a file

FILE_PATH='diretory/file.txt'

if [ -f "$FILE_PATH" ]; then
echo "File is exited"
else
echo "File isn't exited"
fi
