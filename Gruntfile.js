module.exports = function(grunt) {
    //just launch grunt on console on directory
    grunt.initConfig({
        clean: {
            dist: {
                src: ["target/**/*", "temp/**/*"]
            }
        },

        concat: {
            app: {
                options: {
                    banner: "'use strict';\n",
                    process: function(src, filepath) {
                        return src.replace("export default", ' ');
                    }
                },
                src: [
                    "sources/mfglobals.js",
                    "sources/mfcss.js",

                    "sources/ihm/mfdropbox.js",
                    "sources/ihm/mfsliderbox.js",
                    "sources/ihm/mfcomponents.js",
                    "sources/ihm/mfsoftsynthihm.js",
                    "sources/ihm/mfskelhtml.js",
                    "sources/ihm/mfsampleihm.js",
                    "sources/ihm/mfupdates.js",
                    "sources/ihm/mfcreateihm.js",
                    "sources/ihm/wavevisu.js",

                    "sources/snd/mfstrip.js",
                    "sources/snd/mfmixer.js",
                    "sources/snd/mfplayer.js",
                    "sources/snd/mfsound.js",
                    "sources/snd/mfaudiorec.js",

                    "sources/ctrl/mfserialize.js",
                    "sources/ctrl/flatnote.js",
                    "sources/ctrl/mfcmd.js",
                    "sources/ctrl/mfpatterns.js",
                    "sources/ctrl/mfautocompose.js",
                    "sources/ctrl/mfautogenerate.js",

                    "sources/load/mfresourcesloader.js",
       
                    "sources/mfseq.js",
                    "sources/utils.js",
                    "sources/main.js",

                ],
                dest: "temp/app.js"
            }

        },
        config: {
            cwd: '.',
        },

        'string-replace': {
            replace_app: {
                src: 'temp/app.js',
                dest: 'temp/app.1.js',
                files: {
                    '<%= config.dest %>': '<%= config.src %>'
                },
                options: {
                    replacements: [{
                            pattern: /import (.*)/g,
                            replacement: ''
                        },
                        {
                            pattern: /timerworker.js/,
                            replacement: 'timerworker.min.js'
                        },
                        {
                            pattern: /recorderworker.js/,
                            replacement: 'recorderworker.min.js'
                        }
                    ]
                }
            },
            replace_index: {
                src: 'sources/index.html',
                dest: 'target/index.html',
                files: {
                    '<%= config.dest %>': '<%= config.src %>'
                },
                options: {
                    replacements: [{
                            pattern: /(.*)<script(.*)type(.*)src(.*)\r\n/g,
                            replacement: ''
                        },
                        {
                            pattern: /main.css/,
                            replacement: 'main.min.css'
                        },  
                        {
                            pattern: /(.*)mfglobals.js(.*)/,
                            replacement: ''
                        }, 
                        {
                            pattern: /(.*)main.js(.*)/,
                            replacement: ''
                        }, 
                        {
                            pattern: /<\/head>/,
                            replacement: '<script type="module" src="./ordrumbox-v2-app.min.js"></script>\n</head>'
                        }
                    ]
                }
            },
            replace_manifest: {
                src: 'sources/manifest.json',
                dest: 'target/manifest.json',
                files: {
                    '<%= config.dest %>': '<%= config.src %>'
                }
            }
        },
        cssmin: {
            build: {
                src: 'sources/main.css',
                dest: 'target/main.min.css'
            }
        },
        uglify: {
            options: {
                banner: '/*online ordrumbox package : <%=grunt.template.today("yyyy-mm-dd")%>*/\n',
                mangle: {
                    toplevel: true,
                },
                compress: {
                    drop_console: true
                }
            },
            build: {
                files: [{
                        src: 'temp/app.1.js',
                        dest: 'target/ordrumbox-v2-app.min.js',
                    },
                    {
                        src: 'sources/timerworker.js',
                        dest: 'target/timerworker.min.js',
                    },
                    {
                        src: 'sources/recorderworker.js',
                        dest: 'target/recorderworker.min.js',
                    }
                ]
            }
        },
        copy: {
            main: {
                files: [{
                    expand: true,
                    cwd: 'sources/',
                    src: 'assets/**/*',
                    dest: 'target/',
                }]
            }
        }
    });

    // Charge le plugin qui fournit la tâche 'uglify'.
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks("grunt-string-replace");
    grunt.loadNpmTasks('grunt-contrib-copy');

    grunt.registerTask('simple', 'tracing task', function() {
        grunt.log.write('display something...').ok();
    });


    // Tâches par défaut.
    grunt.registerTask('default', ['clean', 'concat', 'string-replace', 'uglify', 'cssmin', 'copy', 'simple']);
};