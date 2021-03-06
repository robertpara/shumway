UNAME = $(shell uname)
THREADS = 8

JSSHELL_HOME = ./jsshell
JSSHELL_URL_BASE = http://ftp.mozilla.org/pub/mozilla.org/firefox/nightly/2013/03/2013-03-01-03-09-09-mozilla-central
ifneq ("$(findstring MINGW32, $(UNAME))", "")
JSSHELL_URL = $(JSSHELL_URL_BASE)/jsshell-win32.zip
else
ifeq ($(UNAME), Darwin)
JSSHELL_URL = $(JSSHELL_URL_BASE)/jsshell-mac.zip
else
JSSHELL_URL = $(JSSHELL_URL_BASE)/jsshell-linux-i686.zip
endif
endif

TAMARIN_HOME = ./tamarin-redux
TAMARIN_URL = http://hg.mozilla.org/tamarin-redux

CLOSURE_JAR = ./cc.jar
CLOSURE_URL = http://closure-compiler.googlecode.com/files/compiler-latest.zip

ASC_JAR = ./asc.jar
ASC_URL = ftp://ftp.mozilla.org/pub/js/tamarin/builds/asc/latest/asc.jar

ifeq ($(UNAME), Darwin)
DARWING_VER = $(shell uname -a)
ifneq ("$(filter 12.%, $(DARWING_VER))", "")
TAMARIN_CONFIG_PARAMS = --mac-sdk=108 --target=x86_64-darwin
else
ifneq ("$(filter 11.%, $(DARWING_VER))", "")
TAMARIN_CONFIG_PARAMS = --mac-sdk=107 --target=x86_64-darwin
else
TAMARIN_CONFIG_PARAMS = --mac-sdk=106 --target=x86_64-darwin
endif
endif
else
ifeq ($(UNAME), Linux)
TAMARIN_CONFIG_PARAMS = --target=i686-linux
endif
endif

APPARAT_URL = http://apparat.googlecode.com/files/apparat-1.0-RC9-bin.tar.gz
APPARAT_HOME = ./apparat
SCALA_URL = http://www.scala-lang.org/sites/default/files/linuxsoft_archives/downloads/distrib/files/scala-2.8.0.final.tgz
SCALA_BIN = $(APPARAT_HOME)/scala-2.8.0.final/bin
APPARAT_BIN = $(APPARAT_HOME)/apparat-1.0-RC9

SHUMWAY_HOME = $(realpath ..)
AVM2_HOME = ../src/avm2
AVMSHELL = avmshell

default:
	@echo "run: make [install-asc|install-closure|install-tamarin|install-js|install-apparat|"
	@echo "           install-swfdec|install-node-modules|"
	@echo "           build-tamarin-tests|run-tamarin-tests|build-playerglobal|clean]"

install-asc: $(ASC_JAR)

$(ASC_JAR):
	wget $(ASC_URL) -O $(ASC_JAR)

install-closure: $(CLOSURE_JAR)

$(CLOSURE_JAR):
	wget $(CLOSURE_URL) -O closure.zip
	unzip -o closure.zip compiler.jar
	mv compiler.jar cc.jar

install-tamarin: $(ASC_JAR) $(TAMARIN_HOME)/configure.py
	rm -rf $(TAMARIN_HOME)/bin
	mkdir $(TAMARIN_HOME)/bin
	cd $(TAMARIN_HOME)/bin; python ../configure.py $(TAMARIN_CONFIG_PARAMS) --enable-debugger
	ASC=../../$(ASC_JAR) make -C $(TAMARIN_HOME)/bin

$(TAMARIN_HOME)/configure.py:
	hg clone $(TAMARIN_URL) $(TAMARIN_HOME)
	cd $(TAMARIN_HOME) hg revert -r 2b38aa82c803 --all   # get a stable version
	cd $(TAMARIN_HOME); patch -p 1 < ../patches/tamarin-108-fix.patch
	cd $(TAMARIN_HOME); patch -p 1 < ../patches/tamarin-npexp-fix.patch
	cd $(TAMARIN_HOME); patch -p 1 < ../patches/tamarin-gcc47-fix.patch
	cd $(TAMARIN_HOME); patch -p 1 < ../patches/tamarin-test-shumway.patch

run-tamarin-tests:
	cd $(TAMARIN_HOME)/test/acceptance; SHUMWAY_HOME=$(SHUMWAY_HOME) ASC=../../../$(ASC_JAR) BUILTINABC=../../generated/builtin.abc SHELLABC=../../generated/shell_toplevel.abc python runtests.py --shumway --threads $(THREADS) ecma3 as3

run-tamarin-as3-tests:
	cd $(TAMARIN_HOME)/test/acceptance; SHUMWAY_HOME=$(SHUMWAY_HOME) ASC=../../../$(ASC_JAR) BUILTINABC=../../generated/builtin.abc SHELLABC=../../generated/shell_toplevel.abc python runtests.py --shumway  --threads $(THREADS) as3

run-tamarin-ecma3-tests:
	cd $(TAMARIN_HOME)/test/acceptance; SHUMWAY_HOME=$(SHUMWAY_HOME) ASC=../../../$(ASC_JAR) BUILTINABC=../../generated/builtin.abc SHELLABC=../../generated/shell_toplevel.abc python runtests.py --threads $(THREADS) --shumway ecma3

run-tamarin-performance:
	cd $(TAMARIN_HOME)/test/performance;  SHUMWAY_HOME=$(SHUMWAY_HOME) ASC=../../../$(ASC_JAR) BUILTINABC=../../generated/builtin.abc SHELLABC=../../generated/shell_toplevel.abc python runtests.py --shumway --avm2 ../../bin/shell/$(AVMSHELL)

install-js:
	-rm -rf $(JSSHELL_HOME)
	mkdir -p $(JSSHELL_HOME)
	wget $(JSSHELL_URL) -O $(JSSHELL_HOME)/jsshell.zip
	unzip $(JSSHELL_HOME)/jsshell.zip -d $(JSSHELL_HOME)
ifeq ($(UNAME), Linux)
	# we are not installing the js into the bin path so there might be
	# a conflict with other libnspr4.so -- adding the js bash proxy
	mv $(JSSHELL_HOME)/js $(JSSHELL_HOME)/js-bin
	cp patches/js $(JSSHELL_HOME)/js
	chmod +x $(JSSHELL_HOME)/js
endif

install-apparat: $(APPARAT_HOME)/apparat.tar.gz
	tar -xkf $(APPARAT_HOME)/apparat.tar.gz -C $(APPARAT_HOME)/
	tar -xkf $(APPARAT_HOME)/scala.tgz -C $(APPARAT_HOME)/

$(APPARAT_HOME)/apparat.tar.gz:
	mkdir -p $(APPARAT_HOME)
	wget $(SCALA_URL) -O $(APPARAT_HOME)/scala.tgz
	wget $(APPARAT_URL) -O $(APPARAT_HOME)/apparat.tar.gz

install-node-modules:
	npm install mocha expect.js temp jshint

install-swfdec:
	git clone git://anongit.freedesktop.org/swfdec/swfdec

build-playerglobal:
	make -C playerGlobal/ build
	cp playerGlobal/bin/playerGlobal.min.abc ../src/flash

clean:
	-rm -rf $(ASC_JAR)
	-rm -rf $(TAMARIN_HOME)
	-rm -rf $(JSSHELL_HOME)
	-rm -rf $(APPARAT_HOME)
	make -C playerGlobal/ clean

.PHONY: install-tamarin install-js install-apparat install-swfdec \
        install-node-modules build-tamarin-tests build-playerglobal \
        clean default

